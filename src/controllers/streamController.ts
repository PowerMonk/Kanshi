/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - STREAM CONTROLLER
 * =============================================================================
 *
 * File: src/controllers/streamController.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The StreamController manages the live video feed from the Raspberry Pi's
 * camera. It coordinates the MjpegStream service with the application
 * lifecycle, handling stream start/stop based on page visibility.
 *
 * VIDEO PIPELINE:
 *
 *   [Pi Camera Module]
 *        ↓
 *   [mjpg_streamer on Pi]
 *        ↓
 *   [WiFi Network]
 *        ↓
 *   [Browser <img> Element]
 *        ↓
 *   [StreamController] ←→ [MjpegStream Service]
 *        ↓
 *   [EventBus: "stream:status"]
 *        ↓
 *   [StatusHud, SessionLogger]
 *
 * PAGE VISIBILITY OPTIMIZATION:
 * When the user switches to another tab or minimizes the browser, the
 * StreamController automatically stops the video stream. This provides
 * several benefits:
 *
 *   1. BANDWIDTH CONSERVATION
 *      MJPEG streams continuously transmit frame data. Stopping the
 *      stream when not visible saves network bandwidth for the Pi.
 *
 *   2. BROWSER RESOURCE EFFICIENCY
 *      Browsers may throttle or suspend hidden tabs. Stopping the
 *      stream prevents resource waste on invisible content.
 *
 *   3. CONSISTENT STATE
 *      When the tab becomes visible again, a fresh connection ensures
 *      the user sees current video, not cached frames.
 *
 * STREAM RECONNECTION:
 * The underlying MjpegStream service handles automatic reconnection
 * on network failures. The StreamController's visibility handling
 * complements this by explicitly stopping during hidden periods.
 *
 * =============================================================================
 */

import type { AppEvents } from "../config/types";
import type { EventBus } from "../services/eventBus";
import { MjpegStream } from "../services/streamService";

/**
 * STREAM CONTROLLER CLASS
 *
 * Coordinates video stream lifecycle with page visibility.
 *
 * This controller acts as a bridge between:
 *   - The DOM (HTMLImageElement for video display)
 *   - The MjpegStream service (connection management)
 *   - The EventBus (status notifications)
 *
 * LIFECYCLE:
 *   1. Instantiate with EventBus
 *   2. Call init() with target image element and stream URL
 *   3. Stream automatically starts
 *   4. Controller manages start/stop based on page visibility
 *
 * SINGLE STREAM ASSUMPTION:
 * The current design assumes a single video stream. For multi-camera
 * support, this controller would need to manage multiple MjpegStream
 * instances or be instantiated multiple times.
 */
export class StreamController {
  /**
   * MJPEG STREAM INSTANCE
   *
   * Reference to the active MjpegStream service instance.
   * Null until init() is called, indicating the stream hasn't
   * been set up yet.
   *
   * OWNERSHIP:
   * The StreamController owns this stream instance and is
   * responsible for its lifecycle (start/stop).
   */
  private stream: MjpegStream | null = null;

  /**
   * CONSTRUCTOR
   *
   * Initializes the StreamController with required dependencies.
   *
   * @param bus - EventBus for passing to the MjpegStream service.
   *              Stream status events will be emitted through this bus.
   *
   * Note: The constructor does not start the stream.
   * Call init() to establish the video connection.
   */
  constructor(private bus: EventBus<AppEvents>) {}

  /**
   * INITIALIZE STREAM
   *
   * Sets up the video stream and begins playback.
   *
   * This method should be called during page initialization after
   * the target image element exists in the DOM.
   *
   * @param image - The HTMLImageElement that will display the video.
   *                This element's src attribute will be managed by
   *                the MjpegStream service. Ensure proper CSS sizing.
   *
   * @param url - The MJPEG stream URL from the Raspberry Pi.
   *              Example: http://192.168.4.1:8080/?action=stream
   *
   * INITIALIZATION SEQUENCE:
   *
   *   1. CREATE STREAM INSTANCE
   *      Instantiate MjpegStream with the image element, URL,
   *      and EventBus for status reporting.
   *
   *   2. START STREAMING
   *      Begin the video connection immediately. The MjpegStream
   *      service handles connection establishment and emits
   *      appropriate status events.
   *
   *   3. ATTACH VISIBILITY HANDLER
   *      Set up the Page Visibility API listener to pause/resume
   *      the stream based on tab visibility.
   *
   * PAGE VISIBILITY API:
   * The visibilitychange event fires when:
   *   - User switches to another tab
   *   - User minimizes the browser window
   *   - User switches to another application (in some browsers)
   *   - User returns to the tab
   *
   * We use document.hidden to check the current state:
   *   - true: Tab is not visible, stop stream
   *   - false: Tab is visible, start stream
   */
  init(image: HTMLImageElement, url: string): void {
    /*
     * CREATE MJPEG STREAM INSTANCE
     *
     * The MjpegStream service encapsulates all connection logic:
     *   - Setting the image src
     *   - Handling load/error events
     *   - Automatic reconnection with exponential backoff
     *   - Emitting status events through the EventBus
     *
     * Passing the EventBus allows stream status to flow through
     * the application's event system.
     */
    this.stream = new MjpegStream(image, url, this.bus);

    /*
     * START INITIAL STREAM
     *
     * Begin streaming immediately. The user opened the page
     * expecting to see video, so we don't wait for any trigger.
     */
    this.stream.start();

    /*
     * PAGE VISIBILITY HANDLER
     *
     * Manages stream lifecycle based on tab visibility.
     *
     * RATIONALE:
     * Continuously streaming video to a hidden tab wastes:
     *   - Pi's network bandwidth
     *   - Browser's network resources
     *   - Browser's rendering resources
     *
     * By stopping when hidden, we conserve resources and ensure
     * a fresh connection when the user returns.
     *
     * RECONNECTION BEHAVIOR:
     * When the tab becomes visible:
     *   - start() is called on the existing stream instance
     *   - MjpegStream internally checks the started flag
     *   - If already started (edge case), the call is a no-op
     *   - Otherwise, a new connection is established
     *
     * The start() call after being hidden ensures:
     *   - Immediate video recovery when user returns
     *   - Fresh frames rather than stale cached data
     *   - Event emissions for UI status updates
     */
    document.addEventListener("visibilitychange", () => {
      /*
       * Guard against calling methods before init() or after
       * some future cleanup method that might set stream to null.
       */
      if (!this.stream) {
        return;
      }

      /*
       * Check visibility state and act accordingly.
       *
       * document.hidden === true:
       *   Tab is not visible, stop the stream to conserve resources.
       *
       * document.hidden === false:
       *   Tab is visible, start/restart the stream for live video.
       */
      if (document.hidden) {
        this.stream.stop();
      } else {
        this.stream.start();
      }
    });
  }
}
