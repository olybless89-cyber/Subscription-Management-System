export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Attaches the bearer token and throws ApiError on any non-2xx so
 * callers can handle it in one catch rather than checking res.ok everywhere. */
export async function authFetch<T = unknown>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.error ?? data.message ?? `Request failed (${res.status})`, res.status);
  }

  return data as T;
}
