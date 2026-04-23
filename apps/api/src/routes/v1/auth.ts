import type { FastifyInstance } from "fastify";
import {
  loginBodySchema,
  registerBodySchema,
} from "@fig/shared";
import { prisma } from "../../db.js";
import { hashPassword, verifyPassword } from "../../auth/password.js";
import {
  createRefreshTokenValue,
  hashToken,
  signAccessToken,
} from "../../auth/jwt.js";
import { env } from "../../env.js";
import { requireAuth } from "../../middleware/auth.js";
import { DateTime } from "luxon";

const REFRESH_COOKIE = "refreshToken";

const COOKIE_PATH = (() => {
  const p = (env.PUBLIC_PATH_PREFIX || "").replace(/\/$/, "");
  return p ? `${p}/v1/auth` : "/v1/auth";
})();

function refreshCookieOptions(): {
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "none" | "strict";
  maxAge: number;
} {
  const days = 7;
  return {
    path: COOKIE_PATH,
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "lax" : "lax",
    maxAge: days * 24 * 60 * 60,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/register", async (request, reply) => {
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: "Email already registered" });
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, role: "PUBLIC" },
    });
    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      email: user.email,
    });
    const refresh = createRefreshTokenValue();
    const expiresAt = DateTime.now().plus({ days: 7 }).toJSDate();
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refresh),
        userId: user.id,
        expiresAt,
      },
    });
    reply.setCookie(REFRESH_COOKIE, refresh, refreshCookieOptions());
    return reply.send({
      accessToken,
      user: { id: user.id, email: user.email, role: user.role },
    });
  });

  app.post("/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }
    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      email: user.email,
    });
    const refresh = createRefreshTokenValue();
    const expiresAt = DateTime.now().plus({ days: 7 }).toJSDate();
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refresh),
        userId: user.id,
        expiresAt,
      },
    });
    reply.setCookie(REFRESH_COOKIE, refresh, refreshCookieOptions());
    return reply.send({
      accessToken,
      user: { id: user.id, email: user.email, role: user.role },
    });
  });

  app.post("/refresh", async (request, reply) => {
    const raw = request.cookies[REFRESH_COOKIE];
    if (!raw) {
      return reply.status(401).send({ error: "Missing refresh token" });
    }
    const tokenHash = hashToken(raw);
    const row = await prisma.refreshToken.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!row) {
      reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      return reply.status(401).send({ error: "Invalid refresh token" });
    }
    await prisma.refreshToken.delete({ where: { id: row.id } });
    const refresh = createRefreshTokenValue();
    const expiresAt = DateTime.now().plus({ days: 7 }).toJSDate();
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refresh),
        userId: row.userId,
        expiresAt,
      },
    });
    reply.setCookie(REFRESH_COOKIE, refresh, refreshCookieOptions());
    const accessToken = signAccessToken({
      sub: row.user.id,
      role: row.user.role,
      email: row.user.email,
    });
    return reply.send({
      accessToken,
      user: {
        id: row.user.id,
        email: row.user.email,
        role: row.user.role,
      },
    });
  });

  app.post("/logout", async (request, reply) => {
    const raw = request.cookies[REFRESH_COOKIE];
    if (raw) {
      await prisma.refreshToken.deleteMany({
        where: { tokenHash: hashToken(raw) },
      });
    }
    reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    return reply.send({ ok: true });
  });

  app.get(
    "/me",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const u = request.user!;
      return reply.send({
        user: { id: u.id, email: u.email, role: u.role },
      });
    },
  );
}
