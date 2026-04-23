import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import type { UserRole } from "@prisma/client";

export type AccessPayload = { sub: string; role: UserRole; email: string };

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
  return decoded;
}

export function createRefreshTokenValue(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
