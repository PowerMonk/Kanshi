/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - ROBOT CONTROL SERVICE
 * =============================================================================
 *
 * File: src/services/robotControlService.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The RobotControlService is the critical communication bridge between the
 * desktop application and the Raspberry Pi's motor controller. It translates
 * user commands into HTTP requests sent to the Flask server (server-side.py)
 * running on the Pi, which in turn controls the physical motors.
 *
 * NETWORK COMMUNICATION FLOW:
 *
 *   [User Input]
 *        ↓
 *   [InputController] → (emits "control:command")
 *        ↓
 *   [ControlController] → calls sendCommand()
 *        ↓
 *   [RobotControlService] → HTTP GET to Flask server
 *        ↓
 *   [WiFi Network - 192.168.4.x]
 *        ↓
 *   [Raspberry Pi Flask Server]
 *        ↓
 *   [GPIO/PWM Motor Control]
 *        ↓
 *   [Physical Motors]
 *
 * COMMAND COOLDOWN MECHANISM:
 * To prevent overwhelming the network and motor controller with rapid
 * commands (e.g., from key repeat or accidental button spam), this service
 * implements a cooldown period. Commands identical to the last sent command
 * are ignored within the cooldown window (COMMAND_COOLDOWN_MS).
 *
 * LATENCY TRACKING:
 * Each command measures its round-trip time (RTT) using the Performance API.
 * This latency information is:
 *   - Emitted via the EventBus for display in the StatusHud
 *   - Useful for diagnosing network issues
 *   - Critical for understanding real-time control responsiveness
 *
 * SPEED PARAMETER:
 * Although the current Pi server uses fixed 85% speed, this service
 * includes speed as a URL parameter for forward compatibility. When
 * the Pi server is updated to support variable speed, no changes to
 * this service will be required.
 *
 * DEPENDENCIES:
 *   - constants.ts: Network URLs and timing parameters
 *   - httpClient.ts: Fetch wrapper with timeout support
 *   - EventBus: For emitting command results
 *
 * =============================================================================
 */

import {
  COMMAND_COOLDOWN_MS,
  CONTROL_REQUEST_TIMEOUT_MS,
  CONTROL_URL,
} from "../config/constants";
import type { AppEvents, RobotCommand } from "../config/types";
import type { EventBus } from "./eventBus";
import { fetchWithTimeout } from "../networking/httpClient";

/**
 * ROBOT CONTROL SERVICE CLASS
 *
 * Manages the sending of movement commands to the Raspberry Pi hardware.
 *
 * This service is stateful, tracking:
 *   - The last command sent (for duplicate filtering)
 *   - The timestamp of the last send (for cooldown enforcement)
 *   - The current speed setting (for future variable speed support)
 *
 * SINGLETON PATTERN:
 * While not enforced by the class itself, the application should instantiate
 * only one RobotControlService to ensure consistent state tracking. Multiple
 * instances would have independent cooldown timers, potentially allowing
 * command flooding.
 *
 * ERROR HANDLING:
 * Network failures are caught and reported via the EventBus with ok: false
 * and latencyMs: null. The service continues operating; subsequent commands
 * may succeed if the network recovers.
 *
 * THREAD SAFETY:
 * JavaScript's single-threaded nature means sendCommand() calls are processed
 * sequentially. However, the async nature means multiple commands can be
 * "in flight" simultaneously. The cooldown mechanism prevents this from
 * causing issues by dropping commands that arrive too quickly.
 */
export class RobotControlService {
  /**
   * LAST COMMAND TRACKING
   *
   * Stores the most recently sent command to enable duplicate filtering.
   * When a new command matches the last command and is within the cooldown
   * period, it's considered a duplicate and dropped.
   *
   * Initialized to null to allow the first command of any type to proceed.
   */
  private lastCommand: RobotCommand | null = null;

  /**
   * LAST SEND TIMESTAMP
   *
   * Unix timestamp (milliseconds) of when the last command was sent.
   * Used with COMMAND_COOLDOWN_MS to determine if a new command should
   * be rate-limited.
   *
   * Initialized to 0 to ensure the first command is never rate-limited
   * (Date.now() - 0 will always exceed the cooldown period).
   */
  private lastSentAt = 0;

  /**
   * SPEED PERCENTAGE
   *
   * Motor speed as a percentage (0-100). Included in command URLs for
   * forward compatibility with variable-speed motor control.
   *
   * The current Raspberry Pi server (server-side.py) ignores this parameter
   * and uses a fixed 85% speed. When the server is updated, this value
   * will control actual motor speed without client-side changes.
   *
   * Default value of 85 matches the current server behavior.
   */
  private speedPercent = 85;

  /**
   * CONSTRUCTOR
   *
   * Initializes the RobotControlService with an optional EventBus.
   *
   * @param bus - Optional EventBus for emitting "control:sent" events.
   *              If omitted, command results are silently discarded.
   *              Useful for testing or scenarios without event handling.
   *
   * DEPENDENCY INJECTION:
   * The EventBus is injected rather than imported directly, enabling:
   *   - Testing with mock EventBus implementations
   *   - Flexible composition with different event systems
   *   - Clear dependency declaration
   */
  constructor(private bus?: EventBus<AppEvents>) {}

  /**
   * SET SPEED PERCENTAGE
   *
   * Updates the motor speed used for future commands.
   *
   * This method clamps the input to the valid range [0, 100] to prevent
   * invalid speed values from being sent to the Pi. Out-of-range values
   * are silently clamped rather than causing errors.
   *
   * @param value - Desired speed percentage. Values outside [0, 100] are
   *                clamped to the nearest valid value.
   *
   * USAGE:
   * Typically called when the user adjusts the speed slider in the UI.
   * The new speed takes effect on the next command sent.
   *
   * NOTE: Current Pi server ignores this value. Implemented for future use.
   */
  setSpeedPercent(value: number): void {
    this.speedPercent = clamp(value, 0, 100);
  }

  /**
   * SEND COMMAND TO RASPBERRY PI
   *
   * Transmits a movement command to the Pi's Flask server via HTTP.
   *
   * This is the core method of the RobotControlService, responsible for:
   *   1. Applying rate limiting (cooldown) to prevent command flooding
   *   2. Constructing the request URL with command and speed parameters
   *   3. Sending the HTTP request with timeout protection
   *   4. Measuring and reporting latency
   *   5. Emitting success/failure events via the EventBus
   *
   * COMMAND FLOW:
   *
   *   sendCommand("forward")
   *        ↓
   *   [Cooldown Check] → If duplicate within cooldown → RETURN (no-op)
   *        ↓
   *   [Build URL] → http://192.168.4.1:5000/forward?speed=85
   *        ↓
   *   [HTTP GET with timeout]
   *        ↓
   *   [Success] → emit("control:sent", { command, latencyMs, ok: true })
   *   [Failure] → emit("control:sent", { command, latencyMs: null, ok: false })
   *
   * @param command - The robot command to send. Must be one of:
   *                  "forward", "backward", "left", "right", "stop"
   *
   * @returns Promise that resolves when the command completes or fails.
   *          The promise never rejects; failures are reported via EventBus.
   *
   * IDEMPOTENCY:
   * Commands are idempotent on the Pi side (sending "forward" twice has the
   * same effect as sending it once while already moving forward). The cooldown
   * mechanism prevents unnecessary network traffic, not duplicate effects.
   *
   * ASYNC CONSIDERATIONS:
   * This method is async to allow non-blocking HTTP requests. Callers should
   * generally fire-and-forget (don't await) to maintain UI responsiveness.
   * The EventBus event provides the definitive result.
   */
  async sendCommand(command: RobotCommand): Promise<void> {
    /*
     * Get the current timestamp for cooldown checking and tracking.
     * Using Date.now() for cooldown (milliseconds since epoch) as it's
     * sufficient precision for human-scale rate limiting.
     */
    const now = Date.now();

    /*
     * COOLDOWN CHECK
     *
     * If this command is the same as the last command and was sent within
     * the cooldown period, silently drop it. This prevents:
     *   - Key repeat flooding (holding down W)
     *   - Accidental rapid button clicks
     *   - Network congestion from redundant commands
     *
     * Note: Different commands always proceed (e.g., "forward" → "left").
     * The cooldown only applies to repeated identical commands.
     */
    if (
      command === this.lastCommand &&
      now - this.lastSentAt < COMMAND_COOLDOWN_MS
    ) {
      return;
    }

    /*
     * BUILD REQUEST URL
     *
     * Constructs the full URL for the Flask endpoint:
     *   Base URL (CONTROL_URL) + command path + speed query parameter
     *
     * Example: http://192.168.4.1:5000/forward?speed=85
     *
     * Using the URL constructor ensures proper encoding and formatting.
     */
    const url = new URL(`${CONTROL_URL}/${command}`);

    /*
     * SPEED PARAMETER
     *
     * Appended as a query parameter for forward compatibility.
     * The Pi server currently ignores this, but including it now means
     * no client changes are needed when variable speed is implemented.
     */
    url.searchParams.set("speed", String(this.speedPercent));

    /*
     * START LATENCY MEASUREMENT
     *
     * Using performance.now() instead of Date.now() for sub-millisecond
     * precision. This measures the time from request initiation to
     * response completion (round-trip time).
     */
    const startedAt = performance.now();

    try {
      /*
       * SEND HTTP REQUEST
       *
       * Uses fetchWithTimeout to ensure the request doesn't hang indefinitely.
       * The timeout (CONTROL_REQUEST_TIMEOUT_MS) is configured in constants.ts.
       *
       * We don't need the response body; the request succeeding is enough
       * to confirm the Pi received and processed the command.
       */
      await fetchWithTimeout(url.toString(), {
        timeoutMs: CONTROL_REQUEST_TIMEOUT_MS,
      });

      /*
       * CALCULATE LATENCY
       *
       * Round to integer milliseconds for cleaner display.
       * This represents the full round-trip time including:
       *   - DNS resolution (usually cached)
       *   - TCP connection (may reuse existing)
       *   - Request transmission
       *   - Pi processing
       *   - Response transmission
       */
      const latencyMs = Math.round(performance.now() - startedAt);

      /*
       * UPDATE TRACKING STATE
       *
       * Record this command and timestamp for future cooldown checks.
       * Only updated on success to allow retries after failures.
       */
      this.lastCommand = command;
      this.lastSentAt = now;

      /*
       * EMIT SUCCESS EVENT
       *
       * Notify subscribers (StatusHud, SessionLogger, etc.) that the
       * command was successfully sent with the measured latency.
       */
      this.bus?.emit("control:sent", { command, latencyMs, ok: true });
    } catch {
      /*
       * EMIT FAILURE EVENT
       *
       * Network errors, timeouts, and server errors all land here.
       * We report latencyMs as null since the timing is meaningless
       * for failed requests.
       *
       * The catch block intentionally doesn't re-throw. Command failures
       * are reported via EventBus, not exceptions. This keeps the
       * control flow simple for callers.
       */
      this.bus?.emit("control:sent", { command, latencyMs: null, ok: false });
    }
  }
}

/**
 * CLAMP UTILITY FUNCTION
 *
 * Constrains a numeric value to a specified range [min, max].
 *
 * This is a pure function with no side effects, used to sanitize
 * user input and ensure values stay within valid bounds.
 *
 * ALGORITHM:
 *   1. If value < min, return min
 *   2. If value > max, return max
 *   3. Otherwise, return value unchanged
 *
 * @param value - The number to clamp
 * @param min - Minimum allowed value (inclusive)
 * @param max - Maximum allowed value (inclusive)
 *
 * @returns The clamped value, guaranteed to be in [min, max]
 *
 * EXAMPLES:
 *   clamp(50, 0, 100)  → 50  (within range)
 *   clamp(-10, 0, 100) → 0   (below min)
 *   clamp(150, 0, 100) → 100 (above max)
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
