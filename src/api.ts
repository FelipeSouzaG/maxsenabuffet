export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");
const normalizePath = (value: string) => (value.startsWith("/") ? value : `/${value}`);

const API_BASE = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || "https://max-buffet-api.felipegalvao-fsg.workers.dev/");

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${normalizePath(path)}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError((data as any)?.error || `Erro ${response.status}`, response.status, (data as any)?.code);
  }

  return data as T;
}
