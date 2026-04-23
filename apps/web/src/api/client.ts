import { v1Url } from "../baseUrl";

const TOKEN_KEY = "fig.accessToken";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function refreshAccessToken(): Promise<boolean> {
  const res = await fetch(v1Url("/auth/refresh"), {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { accessToken?: string };
  if (data.accessToken) {
    setAccessToken(data.accessToken);
    return true;
  }
  return false;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(v1Url(path), {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && !retried && path !== "/auth/refresh") {
    const ok = await refreshAccessToken();
    if (ok) return apiFetch(path, init, true);
  }

  return res;
}
