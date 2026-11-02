import fetch from "node-fetch";

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Fetch JSON with a timeout and a readable error on non-2xx responses.
 */
export async function fetchJson<T = any>(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const error = err as Error;
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs} ms: ${url}`);
    }
    throw new Error(`Network error for ${url}: ${error.message}`);
  }

  if (!response.ok) {
    const hint =
      response.status === 429
        ? " (rate limited, wait a moment and try again)"
        : "";
    throw new Error(
      `HTTP ${response.status} ${response.statusText} for ${url}${hint}`
    );
  }

  return (await response.json()) as T;
}
