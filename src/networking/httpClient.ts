/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - HTTP CLIENT
 * =============================================================================
 *
 * File: src/networking/httpClient.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * This module provides a robust HTTP client wrapper around the browser's
 * native Fetch API. It adds critical functionality for reliable communication
 * with the Raspberry Pi hardware layer, particularly timeout handling.
 *
 * NETWORK ARCHITECTURE CONTEXT:
 *
 *   [Desktop Browser]
 *        ↓ fetchWithTimeout()
 *   [WiFi - 192.168.4.x]
 *        ↓
 *   [Raspberry Pi Flask Server]
 *        ↓
 *   [Motor Control Response]
 *
 * WHY A CUSTOM HTTP CLIENT?
 * The native Fetch API has a critical limitation: no built-in timeout.
 * Without timeout handling:
 *   - Network hangs can freeze the application
 *   - Users get no feedback when the Pi is unreachable
 *   - Resources remain allocated to dead connections
 *
 * This client wraps fetch() with AbortController-based timeouts,
 * ensuring requests complete or fail within a known timeframe.
 *
 * CORS HANDLING:
 * Requests to the Pi use "no-cors" mode by default because:
 *   - The Flask server doesn't send CORS headers
 *   - We only need to trigger GPIO actions, not read responses
 *   - "no-cors" allows fire-and-forget requests to any origin
 *
 * CACHE PREVENTION:
 * All requests use "no-store" cache mode to ensure:
 *   - Fresh requests reach the Pi every time
 *   - Browser doesn't serve stale cached responses
 *   - Each command actually triggers motor action
 *
 * =============================================================================
 */

/**
 * REQUEST OPTIONS TYPE
 *
 * Extends the standard RequestInit with a custom timeout parameter.
 *
 * This type allows callers to pass all standard fetch options plus
 * a timeoutMs value for automatic request abortion.
 *
 * STANDARD FETCH OPTIONS (inherited from RequestInit):
 *   - method: HTTP method (GET, POST, etc.)
 *   - headers: Request headers
 *   - body: Request body
 *   - mode: CORS mode (cors, no-cors, same-origin)
 *   - credentials: Cookie handling
 *   - cache: Cache behavior
 *   - redirect: Redirect handling
 *   - etc.
 *
 * CUSTOM OPTION:
 *   - timeoutMs: Maximum time to wait for response (milliseconds)
 */
export type RequestOptions = RequestInit & { timeoutMs?: number };

/**
 * FETCH WITH TIMEOUT
 *
 * Performs an HTTP request with automatic timeout cancellation.
 *
 * This function wraps the native fetch() API with:
 *   1. Timeout enforcement via AbortController
 *   2. Sensible defaults for Kanshi use cases
 *   3. Guaranteed cleanup of timer resources
 *
 * TIMEOUT MECHANISM:
 * Uses the AbortController API to cancel requests:
 *
 *   [Request Start]
 *        ↓
 *   [setTimeout schedules abort]
 *        ↓
 *   [fetch() in progress]
 *        ↓
 *   ┌───────────────┬───────────────┐
 *   ↓               ↓               ↓
 *   [Response]  [Timeout fires]  [Network error]
 *        ↓           ↓               ↓
 *   [Success]  [AbortError]     [Error]
 *        ↓           ↓               ↓
 *   [clearTimeout in finally]
 *
 * @param url - The URL to fetch. For Kanshi, this is typically a
 *              Raspberry Pi endpoint like "http://192.168.4.1:5000/forward"
 *
 * @param options - Request configuration including timeout.
 *                  All standard fetch options are supported.
 *
 * @returns Promise resolving to the Response object.
 *          Note: In "no-cors" mode, the response body is opaque
 *          (not readable), but that's fine for command endpoints.
 *
 * @throws Error if the request times out (AbortError), network fails,
 *         or any other fetch-related error occurs.
 *
 * DEFAULT BEHAVIORS:
 *   - timeoutMs: 1500ms (override with custom value)
 *   - method: "GET" (most Pi endpoints use GET)
 *   - cache: "no-store" (prevent stale responses)
 *   - mode: "no-cors" (Pi doesn't send CORS headers)
 *
 * USAGE EXAMPLES:
 *
 *   // Basic GET request with default timeout
 *   await fetchWithTimeout("http://192.168.4.1:5000/forward");
 *
 *   // Custom timeout for slow operations
 *   await fetchWithTimeout(url, { timeoutMs: 5000 });
 *
 *   // Override HTTP method
 *   await fetchWithTimeout(url, { method: "POST", body: data });
 *
 * ERROR HANDLING:
 *   try {
 *     await fetchWithTimeout(url, { timeoutMs: 1200 });
 *   } catch (error) {
 *     if (error.name === 'AbortError') {
 *       console.log('Request timed out');
 *     } else {
 *       console.log('Network error:', error.message);
 *     }
 *   }
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestOptions = {},
): Promise<Response> {
  /*
   * EXTRACT TIMEOUT AND REQUEST OPTIONS
   *
   * Destructure to separate timeoutMs (our custom option) from
   * standard fetch options. Default timeout is 1500ms.
   */
  const { timeoutMs = 1500, ...request } = options;

  /*
   * CREATE ABORT CONTROLLER
   *
   * AbortController is the standard mechanism for cancelling fetch requests.
   * The controller's signal is passed to fetch(), and calling abort()
   * will cause the fetch to reject with an AbortError.
   */
  const controller = new AbortController();

  /*
   * SCHEDULE TIMEOUT
   *
   * Set a timer to abort the request after timeoutMs milliseconds.
   * If the request completes before the timeout, we'll clear this timer.
   */
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    /*
     * EXECUTE FETCH REQUEST
     *
     * Merge our defaults with caller-provided options.
     * The signal from AbortController enables cancellation.
     *
     * OPTION EXPLANATIONS:
     *
     * method: "GET"
     *   Default to GET since Pi control endpoints use GET.
     *   Can be overridden via request options.
     *
     * cache: "no-store"
     *   Prevents browser from caching responses.
     *   Each request must reach the Pi for motor commands to work.
     *   "no-store" is stronger than "no-cache" - it never stores.
     *
     * mode: request.mode ?? "no-cors"
     *   Default to "no-cors" for cross-origin requests.
     *   The Pi Flask server doesn't send CORS headers.
     *   "no-cors" allows the request but makes response opaque.
     *   This is fine since we only need to trigger actions, not read data.
     *   Caller can override with "cors" if Pi is configured with CORS.
     *
     * ...request
     *   Spread remaining options to allow full customization.
     *
     * signal: controller.signal
     *   Connect the abort signal. When abort() is called,
     *   fetch will reject with an AbortError.
     */
    return await fetch(url, {
      method: "GET",
      cache: "no-store",
      mode: request.mode ?? "no-cors",
      ...request,
      signal: controller.signal,
    });
  } finally {
    /*
     * CLEANUP TIMEOUT
     *
     * The finally block ensures the timeout is cleared regardless of
     * whether the request succeeded, failed, or was aborted.
     *
     * This prevents:
     *   - Memory leaks from accumulated timers
     *   - Unexpected abort() calls after request completion
     */
    clearTimeout(timeoutId);
  }
}
