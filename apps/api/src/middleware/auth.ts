import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../auth/jwt.js";
import { prisma } from "../db.js";
import type { UserRole } from "@prisma/client";

function getBearer(request: FastifyRequest): string | undefined {
  const h = request.headers.authorization;
  if (!h?.startsWith("Bearer ")) return undefined;
  return h.slice(7);
}

export async function optionalAuth(
  request: FastifyRequest,
): Promise<void> {
  const token = getBearer(request);
  if (!token) return;
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return;
    request.user = { id: user.id, email: user.email, role: user.role };
  } catch {
    return;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = getBearer(request);
  if (!token) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    request.user = { id: user.id, email: user.email, role: user.role };
  } catch {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }
  };
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.user || request.user.role !== "ADMIN") {
    return reply.status(403).send({ error: "Forbidden" });
  }
}

export async function requireAdminAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;
  await requireAdmin(request, reply);
}
