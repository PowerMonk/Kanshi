export type RequestOptions = RequestInit & { timeoutMs?: number };

export async function fetchWithTimeout(
  url: string,
  options: RequestOptions = {},
): Promise<Response> {
  const { timeoutMs = 1500, ...request } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      cache: "no-store",
      mode: request.mode ?? "no-cors",
      ...request,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
