import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/**
 * Loads monorepo root `.env`, then `apps/api/.env` (later overrides).
 * Call before reading process.env (Prisma CLI is handled via root npm scripts).
 */
export function loadEnvFiles(): void {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const apiRoot = path.resolve(dir, "..");
  const repoRoot = path.resolve(apiRoot, "..", "..");
  config({ path: path.join(repoRoot, ".env") });
  config({ path: path.join(apiRoot, ".env") });
}
