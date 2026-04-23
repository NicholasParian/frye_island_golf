import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { ProxyOptions } from "vite";

function normalizeViteBase(raw: string | undefined): string {
  if (raw == null || raw === "" || raw === "/") {
    return "/";
  }
  const s0 = raw.trim();
  const withSlash = s0.startsWith("/") ? s0 : `/${s0}`;
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
}

export default defineConfig(({ mode }) => {
  const e = loadEnv(mode, process.cwd(), "VITE_");
  const base = normalizeViteBase(e.VITE_PUBLIC_PATH_PREFIX);

  const pfx = base === "/" ? "" : base.replace(/\/$/, "");
  const v1Key = pfx ? `${pfx}/v1` : "/v1";
  const proxy: Record<string, ProxyOptions> = pfx
    ? {
        [v1Key]: {
          target: "http://localhost:4000",
          changeOrigin: true,
          rewrite: (p) => p.replace(new RegExp(`^${escapeRegExp(pfx)}`), "") || "/",
        },
      }
    : {
        "/v1": { target: "http://localhost:4000", changeOrigin: true },
      };

  return {
    plugins: [react()],
    base,
    server: {
      port: 5173,
      proxy,
    },
  };
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
