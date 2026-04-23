#!/usr/bin/env node
/**
 * Loads repo-root `.env` then `apps/api/.env` into process.env, then runs a command.
 * Usage: node scripts/with-repo-env.cjs -- npm run prisma:migrate -w @fig/api
 */
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { config } = require("dotenv");

const repoRoot = path.resolve(__dirname, "..");
const apiRoot = path.join(repoRoot, "apps", "api");

config({ path: path.join(repoRoot, ".env") });
config({ path: path.join(apiRoot, ".env") });

const sep = process.argv.indexOf("--");
const cmd = sep === -1 ? [] : process.argv.slice(sep + 1);
if (cmd.length === 0) {
  console.error("Usage: node scripts/with-repo-env.cjs -- <command> [args...]");
  process.exit(1);
}

const result = spawnSync(cmd[0], cmd.slice(1), {
  stdio: "inherit",
  cwd: repoRoot,
  env: process.env,
  shell: process.platform === "win32",
});

process.exit(result.status === null ? 1 : result.status);
