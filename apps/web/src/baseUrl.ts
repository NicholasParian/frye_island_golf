/** Vite `base` with trailing slash, or "/". */
const base = import.meta.env.BASE_URL;

/**
 * Public URL for API routes under /v1 (e.g. /fryeIslandGolf/v1/auth/login when `base` is not root).
 * `apiPath` is the segment after /v1, e.g. "/auth/me" or "auth/me".
 */
export function v1Url(apiPath: string): string {
  const p = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  return `${base}v1${p}`;
}
