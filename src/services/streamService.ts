/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - MJPEG STREAM SERVICE
 * =============================================================================
 *
 * File: src/services/streamService.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The MjpegStream class manages the live video feed from the Raspberry Pi's
 * camera module. It handles connection lifecycle, automatic reconnection on
 * failure, and status reporting through the EventBus system.
 *
 * VIDEO STREAMING ARCHITECTURE:
 *
 *   [Raspberry Pi Camera Module]
 *        ↓
 *   [mjpg_streamer Process]
 *        ↓
 *   [HTTP MJPEG Stream - Port 8080]
 *        ↓
 *   [WiFi Network - 192.168.4.x]
 *        ↓
 *   [Browser <img> Element]
 *        ↓
 *   [MjpegStream Service] → EventBus → [UI Components]
 *
 * MJPEG FORMAT:
 * Motion JPEG (MJPEG) is a video format where each frame is a complete JPEG
 * image. The mjpg_streamer on the Pi serves frames as a multipart HTTP response:
 *
 *   Content-Type: multipart/x-mixed-replace; boundary=--boundary
 *
 *   --boundary
 *   Content-Type: image/jpeg
 *   Content-Length: 12345
 *
 *   [JPEG binary data]
 *   --boundary
 *   Content-Type: image/jpeg
 *   ...
 *
 * HTML <img> elements natively understand this format, continuously updating
 * as new frames arrive. This eliminates the need for JavaScript frame decoding.
 *
 * BROWSER COMPATIBILITY:
 * MJPEG streaming via <img src="..."> is supported in all modern browsers.
 * The approach is simpler and more efficient than canvas-based video rendering.
 *
 * RECONNECTION STRATEGY:
 * Network interruptions are common in mobile robotics scenarios. This service
 * implements exponential backoff reconnection:
 *
 *   [Connection Lost]
 *        ↓
 *   [Wait 750ms] → [Retry]
 *        ↓ (fail)
 *   [Wait 1500ms] → [Retry]
 *        ↓ (fail)
 *   [Wait 3000ms] → [Retry]
 *        ↓ (fail)
 *   [Wait 5000ms (max)] → [Retry]
 *        ↓
 *   [Continue at 5000ms until success]
 *
 * This prevents network flooding while ensuring quick recovery.
 *
 * =============================================================================
 */

import {
  STREAM_RECONNECT_BASE_MS,
  STREAM_RECONNECT_MAX_MS,
} from "../config/constants";
import type { AppEvents, StreamStatus } from "../config/types";
import type { EventBus } from "./eventBus";

/**
 * STREAM OPTIONS TYPE
 *
 * Configuration options for customizing stream behavior.
 *
 * These options allow overriding default reconnection timing, useful for:
 *   - Testing with faster reconnection cycles
 *   - Adjusting for different network conditions
 *   - Debugging connection issues
 *
 * All options are optional; defaults from constants.ts are used if not specified.
 */
type StreamOptions = {
  /**
   * Initial delay before first reconnection attempt (milliseconds).
   * Subsequent attempts use exponential backoff from this base.
   * @default STREAM_RECONNECT_BASE_MS (750)
   */
  reconnectBaseMs?: number;

  /**
   * Maximum delay between reconnection attempts (milliseconds).
   * Backoff is capped at this value to ensure timely recovery detection.
   * @default STREAM_RECONNECT_MAX_MS (5000)
   */
  reconnectMaxMs?: number;
};

/**
 * MJPEG STREAM CLASS
 *
 * Manages a live MJPEG video stream with automatic reconnection.
 *
 * This class wraps an HTML <img> element and controls its src attribute
 * to establish and maintain the video stream connection. It monitors
 * for load/error events to track connection state and trigger reconnection.
 *
 * LIFECYCLE:
 *   1. Instantiate with target <img> element and stream URL
 *   2. Call start() to begin streaming
 *   3. Monitor "stream:status" events for connection state
 *   4. Call stop() when done to clean up resources
 *
 * STATE MACHINE:
 *
 *   [STOPPED] → start() → [CONNECTING]
 *                              ↓
 *                         load event
 *                              ↓
 *                          [LIVE] ←─────────────┐
 *                              ↓                │
 *                         error event           │
 *                              ↓                │
 *                         [ERROR]               │
 *                              ↓                │
 *                    (exponential backoff)      │
 *                              ↓                │
 *                       [CONNECTING] ───────────┘
 *                              ↓
 *                          stop()
 *                              ↓
 *                         [STOPPED]
 *
 * RESOURCE MANAGEMENT:
 * The stop() method removes event listeners and clears timers to prevent
 * memory leaks. Always call stop() before discarding an MjpegStream instance.
 */
export class MjpegStream {
  /**
   * RETRY COUNTER
   *
   * Tracks the number of consecutive failed connection attempts.
   * Used to calculate exponential backoff delay:
   *   delay = base * 2^retryCount
   *
   * Reset to 0 on successful connection to ensure quick recovery
   * from transient failures after stable operation.
   */
  private retryCount = 0;

  /**
   * RECONNECT TIMER HANDLE
   *
   * Stores the setTimeout handle for pending reconnection attempts.
   * Enables cancellation when stop() is called or a new reconnection
   * is scheduled before the previous one fires.
   *
   * null indicates no reconnection is pending.
   */
  private reconnectTimer: number | null = null;

  /**
   * STARTED FLAG
   *
   * Indicates whether the stream has been started and should be active.
   * Used to prevent:
   *   - Double initialization from multiple start() calls
   *   - Reconnection attempts after stop() is called
   *
   * This is distinct from connection state; started means "trying to be
   * connected," not necessarily "currently connected."
   */
  private started = false;

  /**
   * CONSTRUCTOR
   *
   * Initializes the MjpegStream with required dependencies.
   *
   * @param image - The HTML <img> element that will display the video stream.
   *                This element's src attribute will be managed by the service.
   *                The element should be sized appropriately in CSS.
   *
   * @param streamUrl - The MJPEG stream URL from the Raspberry Pi.
   *                    Example: http://192.168.4.1:8080/?action=stream
   *                    Must serve multipart/x-mixed-replace content.
   *
   * @param bus - Optional EventBus for emitting "stream:status" events.
   *              If omitted, status changes are not reported externally.
   *
   * @param options - Optional configuration for reconnection timing.
   *                  Defaults to values from constants.ts.
   *
   * SETUP NOTE:
   * The constructor does not start the stream. Call start() separately
   * to begin streaming. This enables lazy initialization and explicit
   * lifecycle control.
   */
  constructor(
    private image: HTMLImageElement,
    private streamUrl: string,
    private bus?: EventBus<AppEvents>,
    private options: StreamOptions = {},
  ) {}

  /**
   * START STREAMING
   *
   * Initiates the video stream connection.
   *
   * This method:
   *   1. Sets up event listeners on the <img> element
   *   2. Resets the retry counter
   *   3. Triggers the initial connection
   *
   * EVENT LISTENERS:
   *   - "load": Fired when the stream successfully delivers a frame.
   *             Indicates the connection is live.
   *   - "error": Fired when the connection fails or is interrupted.
   *              Triggers the reconnection logic.
   *
   * IDEMPOTENCY:
   * Calling start() multiple times is safe; subsequent calls are no-ops.
   * This prevents duplicate event listeners and state corruption.
   *
   * To restart a stopped stream, call start() again after stop().
   */
  start(): void {
    /*
     * Guard against multiple start() calls.
     * If already started, do nothing to prevent listener duplication.
     */
    if (this.started) {
      return;
    }

    /*
     * Mark as started before any async operations.
     * This flag controls reconnection behavior in error handlers.
     */
    this.started = true;

    /*
     * Reset retry counter for fresh exponential backoff.
     * Important if this is a restart after previous stop().
     */
    this.retryCount = 0;

    /*
     * Attach event listeners for stream state monitoring.
     * Using arrow function properties (bound methods) ensures
     * correct 'this' context and enables proper removal.
     */
    this.image.addEventListener("load", this.handleLoad);
    this.image.addEventListener("error", this.handleError);

    /*
     * Initiate the first connection attempt.
     * This sets the image src and emits "connecting" status.
     */
    this.connect();
  }

  /**
   * STOP STREAMING
   *
   * Terminates the video stream and cleans up resources.
   *
   * This method:
   *   1. Clears the started flag to prevent reconnection
   *   2. Removes event listeners to prevent memory leaks
   *   3. Cancels any pending reconnection timer
   *   4. Clears the image src to stop the browser from fetching
   *
   * CLEANUP IMPORTANCE:
   * Proper cleanup prevents:
   *   - Memory leaks from orphaned event listeners
   *   - Unexpected reconnection attempts
   *   - Network activity after the component is unmounted
   *
   * RESTART SUPPORT:
   * After stop(), the stream can be restarted by calling start() again.
   * The retry counter is reset in start(), ensuring fresh backoff.
   */
  stop(): void {
    /*
     * Clear the started flag first.
     * This ensures any in-flight error handlers don't trigger reconnection.
     */
    this.started = false;

    /*
     * Remove event listeners to prevent:
     *   - Further event handling after stop
     *   - Memory leaks from orphaned handlers
     */
    this.image.removeEventListener("load", this.handleLoad);
    this.image.removeEventListener("error", this.handleError);

    /*
     * Cancel any pending reconnection attempt.
     * clearTimeout is safe to call with null (no-op).
     */
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    /*
     * Clear the image source to stop the browser from continuing
     * to fetch stream data. removeAttribute ensures clean state.
     */
    this.image.removeAttribute("src");
  }

  /**
   * INITIATE CONNECTION
   *
   * Sets the image src to begin streaming from the Pi.
   *
   * CACHE BUSTING:
   * A timestamp query parameter is appended to prevent browser caching
   * of the stream URL. Without this, the browser might serve a cached
   * (stale) response or refuse to reconnect after an error.
   *
   * URL CONSTRUCTION:
   * Handles both URLs with existing query parameters and those without:
   *   - http://host:port/?action=stream → &t=1234567890
   *   - http://host:port/stream → ?t=1234567890
   *
   * STATUS EMISSION:
   * Emits "connecting" status to allow UI to show loading state.
   */
  private connect(): void {
    /*
     * Generate a cache-busting timestamp parameter.
     * Uses current Unix timestamp to ensure uniqueness.
     */
    const cacheBuster = `t=${Date.now()}`;

    /*
     * Determine the appropriate query string separator.
     * If URL already has query params (?), use & to append.
     * Otherwise, use ? to start the query string.
     */
    const separator = this.streamUrl.includes("?") ? "&" : "?";

    /*
     * Emit connecting status before attempting connection.
     * UI can show loading indicator while waiting for first frame.
     */
    this.emitStatus("connecting");

    /*
     * Set the image source to initiate the HTTP request.
     * The browser will start receiving the MJPEG stream and
     * fire "load" when the first frame is rendered, or "error"
     * if the connection fails.
     */
    this.image.src = `${this.streamUrl}${separator}${cacheBuster}`;
  }

  /**
   * HANDLE SUCCESSFUL LOAD
   *
   * Called when the <img> element successfully loads a stream frame.
   *
   * This handler is defined as an arrow function property to ensure
   * correct 'this' binding when used as an event listener callback.
   *
   * ACTIONS:
   *   1. Reset retry counter (connection is healthy)
   *   2. Emit "live" status for UI update
   *
   * NOTE: For MJPEG streams, "load" fires once when the stream starts,
   * not for every frame. Frame updates happen transparently in the browser.
   */
  private handleLoad = (): void => {
    /*
     * Reset retry counter since connection is successful.
     * This ensures quick recovery if future disconnections occur
     * (backoff restarts from base delay, not accumulated).
     */
    this.retryCount = 0;

    /*
     * Emit live status to notify UI components.
     * StatusHud and other subscribers can update their displays.
     */
    this.emitStatus("live");
  };

  /**
   * HANDLE CONNECTION ERROR
   *
   * Called when the stream connection fails or is interrupted.
   *
   * This handler is defined as an arrow function property to ensure
   * correct 'this' binding when used as an event listener callback.
   *
   * ERROR SCENARIOS:
   *   - Pi is not reachable (WiFi out of range)
   *   - mjpg_streamer process crashed on Pi
   *   - Network interruption
   *   - Pi rebooting
   *
   * ACTIONS:
   *   1. Emit "error" status for UI update
   *   2. Schedule reconnection attempt with exponential backoff
   */
  private handleError = (): void => {
    /*
     * Emit error status immediately.
     * UI can show disconnected indicator while reconnection proceeds.
     */
    this.emitStatus("error");

    /*
     * Schedule a reconnection attempt.
     * The method handles backoff calculation and timer management.
     */
    this.scheduleReconnect();
  };

  /**
   * SCHEDULE RECONNECTION ATTEMPT
   *
   * Sets up a delayed reconnection attempt using exponential backoff.
   *
   * EXPONENTIAL BACKOFF ALGORITHM:
   *   delay = min(base * 2^retryCount, maxDelay)
   *
   * This provides:
   *   - Quick initial recovery (750ms first delay)
   *   - Graceful backing off under persistent failure
   *   - Bounded maximum delay (5000ms) for timely recovery detection
   *
   * TIMER MANAGEMENT:
   * If a reconnection is already scheduled, the previous timer is cleared
   * before setting the new one. This prevents timer accumulation from
   * rapid error events.
   */
  private scheduleReconnect(): void {
    /*
     * Don't schedule reconnection if stop() was called.
     * The started flag serves as the authoritative "should be running" indicator.
     */
    if (!this.started) {
      return;
    }

    /*
     * Use configured values or fall back to defaults from constants.
     * Nullish coalescing handles both undefined and explicit null.
     */
    const base = this.options.reconnectBaseMs ?? STREAM_RECONNECT_BASE_MS;
    const max = this.options.reconnectMaxMs ?? STREAM_RECONNECT_MAX_MS;

    /*
     * CALCULATE BACKOFF DELAY
     *
     * Formula: base * 2^retryCount, capped at max
     *
     * Examples (with default values):
     *   retryCount 0: 750 * 1 = 750ms
     *   retryCount 1: 750 * 2 = 1500ms
     *   retryCount 2: 750 * 4 = 3000ms
     *   retryCount 3: 750 * 8 = 6000ms → capped to 5000ms
     */
    const delay = Math.min(base * 2 ** this.retryCount, max);

    /*
     * Increment retry counter for next potential failure.
     * This happens after calculating the current delay.
     */
    this.retryCount += 1;

    /*
     * Clear any existing reconnection timer.
     * Prevents multiple timers from accumulating.
     */
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }

    /*
     * Schedule the reconnection attempt.
     * The connect() method will emit "connecting" and set the new src.
     */
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  /**
   * EMIT STREAM STATUS
   *
   * Helper method to emit stream status events through the EventBus.
   *
   * This encapsulates the optional chaining for EventBus access and
   * provides a single point for status emission logic.
   *
   * @param status - The current stream status ("connecting", "live", "error")
   *
   * SUBSCRIBERS:
   * Components like StreamController and StatusHud subscribe to these
   * events to update their visual representations of stream state.
   */
  private emitStatus(status: StreamStatus): void {
    this.bus?.emit("stream:status", { status });
  }
}
