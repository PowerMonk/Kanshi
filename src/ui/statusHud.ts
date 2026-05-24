/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - STATUS HUD
 * =============================================================================
 *
 * File: src/ui/statusHud.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The StatusHud (Heads-Up Display) provides real-time visual feedback about
 * the robot's operational state. It displays three critical pieces of
 * information that operators need at a glance:
 *
 *   1. ROBOT STATUS: Current movement state (FORWARD, LEFT, IDLE, etc.)
 *   2. NETWORK LATENCY: Round-trip time to Raspberry Pi
 *   3. STREAM STATUS: Video feed connection state
 *
 * USER EXPERIENCE ROLE:
 * The HUD creates operator confidence by continuously showing system state.
 * Without this feedback, operators would be "flying blind" - unsure if their
 * commands are being received or if the video is current.
 *
 * INFORMATION DISPLAY:
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  FORWARD • ACTIVE     Latency: 23ms     Live Feed: ONLINE │
 *   └────────────────────────────────────────────────────────────┘
 *
 * REACTIVE UPDATES:
 * The HUD subscribes to EventBus events and updates automatically:
 *   - control:command → Updates robot status
 *   - control:sent → Updates latency display
 *   - stream:status → Updates stream connection status
 *
 * This reactive pattern means the HUD doesn't poll for state changes;
 * it's notified immediately when relevant events occur.
 *
 * GRACEFUL DEGRADATION:
 * If any display element is not present in the DOM (null), the HUD
 * silently skips updates for that element. This allows flexible page
 * layouts where not all status fields are displayed.
 *
 * =============================================================================
 */

import type { AppEvents, RobotCommand, StreamStatus } from "../config/types";
import type { EventBus } from "../services/eventBus";

/**
 * STATUS ELEMENTS TYPE
 *
 * Defines the DOM elements that the StatusHud can update.
 * All elements are optional to support partial HUD configurations.
 *
 * ELEMENT PURPOSES:
 *   - status: Displays current robot movement state
 *   - latency: Displays network round-trip time
 *   - stream: Displays video feed connection state
 *
 * Why optional (nullable)?
 * Different pages may display different subsets of status information.
 * The main dashboard might show all three, while a settings page might
 * only show connection status. Making elements optional enables this
 * flexibility without requiring separate HUD implementations.
 */
type StatusElements = {
  status?: HTMLElement | null;
  latency?: HTMLElement | null;
  stream?: HTMLElement | null;
};

/**
 * STATUS HUD CLASS
 *
 * Manages real-time status display for robot operation monitoring.
 *
 * This class follows the "observer" pattern, subscribing to relevant
 * events and updating the DOM in response. It acts as a view layer
 * that reflects system state without maintaining its own state.
 *
 * LIFECYCLE:
 *   1. Instantiate with EventBus and DOM element references
 *   2. Call init() to start event subscriptions
 *   3. HUD automatically updates as events occur
 *
 * NO CLEANUP:
 * The current implementation doesn't provide a method to unsubscribe
 * from events. This is acceptable because:
 *   - The HUD runs for the page lifetime
 *   - Page navigation destroys all subscriptions naturally
 *   - Adding cleanup would add complexity for minimal benefit
 */
export class StatusHud {
  /**
   * CONSTRUCTOR
   *
   * Initializes the StatusHud with required dependencies.
   *
   * @param bus - EventBus for subscribing to status-related events.
   *              The HUD listens for control and stream events.
   *
   * @param elements - Object containing references to DOM elements
   *                   for each status display. Missing elements are
   *                   silently skipped during updates.
   *
   * ELEMENT RESOLUTION:
   * Elements should be resolved before instantiation:
   *
   *   const hud = new StatusHud(bus, {
   *     status: document.getElementById("bot-status"),
   *     latency: document.getElementById("latency-display"),
   *     stream: document.getElementById("stream-status"),
   *   });
   *
   * Using getElementById or querySelector with null fallback allows
   * graceful handling of missing elements.
   */
  constructor(
    private bus: EventBus<AppEvents>,
    private elements: StatusElements,
  ) {}

  /**
   * INITIALIZE HUD
   *
   * Sets up event subscriptions for automatic status updates.
   *
   * After calling init(), the HUD will automatically update its
   * displays whenever relevant events occur. No further action
   * is required from the caller.
   *
   * EVENT SUBSCRIPTIONS:
   *
   *   1. control:command
   *      Fired when user issues a movement command.
   *      Updates the robot status display to show current action.
   *
   *   2. control:sent
   *      Fired after a command is sent to the Pi.
   *      Updates the latency display with round-trip time.
   *
   *   3. stream:status
   *      Fired when video stream state changes.
   *      Updates the stream status display.
   *
   * UPDATE GUARDS:
   * Each subscription checks if its corresponding element exists
   * before attempting to update. This prevents null reference errors
   * and allows partial HUD configurations.
   */
  init(): void {
    /*
     * ROBOT STATUS SUBSCRIPTION
     *
     * Listen for control commands and update the status display.
     * The display shows the current movement direction or IDLE.
     *
     * The command is formatted using formatBotStatus() which
     * generates HTML with visual indicators.
     */
    this.bus.on("control:command", ({ command }) => {
      if (this.elements.status) {
        this.elements.status.innerHTML = formatBotStatus(command);
      }
    });

    /*
     * LATENCY DISPLAY SUBSCRIPTION
     *
     * Listen for sent commands and display the network latency.
     * Shows the round-trip time in milliseconds or "--" if failed.
     *
     * latencyMs === null indicates the request failed or timed out.
     * In this case, we show "--" rather than a stale value.
     */
    this.bus.on("control:sent", ({ latencyMs }) => {
      if (this.elements.latency) {
        const label = latencyMs === null ? "--" : `${latencyMs}ms`;
        this.elements.latency.textContent = `Latency: ${label}`;
      }
    });

    /*
     * STREAM STATUS SUBSCRIPTION
     *
     * Listen for stream state changes and update the display.
     * Shows ONLINE, CONNECTING, or RECONNECTING based on state.
     */
    this.bus.on("stream:status", ({ status }) => {
      if (this.elements.stream) {
        this.elements.stream.textContent = formatStreamStatus(status);
      }
    });
  }
}

/**
 * FORMAT ROBOT STATUS
 *
 * Generates HTML markup for the robot status display.
 *
 * @param command - The current robot command being executed
 * @returns HTML string with formatted status display
 *
 * DISPLAY FORMAT:
 *   Active command: "[COMMAND] • ACTIVE"
 *   Stop/Idle: "IDLE • STANDBY"
 *
 * VISUAL DESIGN:
 *   - Command name is prominent (inherited styling)
 *   - Bullet separator with primary color accent
 *   - State label (ACTIVE/STANDBY) is smaller and dimmed
 *
 * HTML OUTPUT EXAMPLES:
 *   "forward" → "FORWARD • ACTIVE"
 *   "stop" → "IDLE • STANDBY"
 *
 * SECURITY NOTE:
 * The command value comes from the RobotCommand type, which is a
 * fixed set of string literals. No user input is interpolated into
 * the HTML, so XSS injection is not a concern here.
 */
function formatBotStatus(command: RobotCommand): string {
  /*
   * Special case for stop command: show IDLE status
   */
  if (command === "stop") {
    return 'IDLE <span class="text-primary opacity-50">&bull;</span> <span class="text-sm font-medium text-white/60">STANDBY</span>';
  }

  /*
   * For movement commands: show uppercase command name
   */
  return `${command.toUpperCase()} <span class=\"text-primary opacity-50\">&bull;</span> <span class=\"text-sm font-medium text-white/60\">ACTIVE</span>`;
}

/**
 * FORMAT STREAM STATUS
 *
 * Generates a human-readable string for stream connection state.
 *
 * @param status - The current stream status
 * @returns Display string for the stream status
 *
 * STATUS MEANINGS:
 *   - "live": Stream is actively receiving frames
 *   - "connecting": Initial connection attempt or reconnecting
 *   - "error": Connection failed (maps to RECONNECTING since auto-retry is active)
 *
 * DISPLAY VALUES:
 *   - "Live Feed: ONLINE" - Good state, video is flowing
 *   - "Live Feed: CONNECTING" - Initial connection attempt
 *   - "Live Feed: RECONNECTING" - Recovering from error
 *
 * WHY "RECONNECTING" FOR ERRORS:
 * The MjpegStream service automatically attempts reconnection on errors.
 * Showing "RECONNECTING" is more accurate than "OFFLINE" or "ERROR"
 * because the system is actively trying to recover. This sets user
 * expectations appropriately.
 */
function formatStreamStatus(status: StreamStatus): string {
  if (status === "live") {
    return "Live Feed: ONLINE";
  }
  if (status === "connecting") {
    return "Live Feed: CONNECTING";
  }
  /*
   * Error state: The stream service is auto-retrying,
   * so we indicate active reconnection rather than failure.
   */
  return "Live Feed: RECONNECTING";
}
