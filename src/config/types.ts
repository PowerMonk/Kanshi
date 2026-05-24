/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - TYPE DEFINITIONS
 * =============================================================================
 *
 * File: src/config/types.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * This module serves as the central type definition hub for the entire Kanshi
 * desktop application. It establishes the TypeScript contracts that ensure
 * type safety across all system components, from user input handling to
 * network communication with the Raspberry Pi hardware layer.
 *
 * ARCHITECTURAL ROLE:
 * In the Kanshi distributed architecture, this file defines the data structures
 * used exclusively on the desktop PC side. These types govern:
 *   - Commands sent to the Raspberry Pi motor controller
 *   - Application configuration persisted in browser localStorage
 *   - Events flowing through the application's event-driven architecture
 *   - UI state representations for real-time status displays
 *
 * The Raspberry Pi server (server-side.py) does not consume these types directly;
 * instead, it receives plain HTTP requests with command strings that match
 * the RobotCommand type values.
 *
 * DESIGN PHILOSOPHY:
 * All types use TypeScript's discriminated unions and literal types to provide
 * compile-time safety and enable exhaustive pattern matching. This prevents
 * invalid states from being representable in the type system.
 *
 * =============================================================================
 */

/**
 * ROBOT COMMAND TYPE
 *
 * Represents the complete set of movement commands that can be issued to the
 * Kanshi robot's motor controller running on the Raspberry Pi.
 *
 * These string literals directly correspond to HTTP endpoint paths on the
 * Flask server (server-side.py). When a command is sent, it translates to:
 *   - "forward"  → GET http://192.168.4.1:5000/forward
 *   - "backward" → GET http://192.168.4.1:5000/backward
 *   - "left"     → GET http://192.168.4.1:5000/left
 *   - "right"    → GET http://192.168.4.1:5000/right
 *   - "stop"     → GET http://192.168.4.1:5000/stop
 *
 * MOTOR BEHAVIOR:
 * - "forward"/"backward": Both motors rotate in the same direction
 * - "left"/"right": Differential steering (one motor forward, one backward)
 * - "stop": All motor PWM signals set to zero, immediate halt
 *
 * The "stop" command is particularly critical as it serves as the safety
 * mechanism, automatically sent on key release (keyup events) to prevent
 * the robot from continuing movement after user input ceases.
 */
export type RobotCommand = "forward" | "backward" | "left" | "right" | "stop";

/**
 * APPLICATION CONFIGURATION TYPE
 *
 * Defines the complete configuration state for the Kanshi desktop application.
 * This configuration is persisted to browser localStorage and survives page
 * reloads and browser restarts.
 *
 * STRUCTURE:
 * The configuration is organized into logical domains:
 *
 * 1. CONTROL DOMAIN (control):
 *    Settings related to robot movement and motor control.
 *
 *    - speedPercent: Motor speed as a percentage (0-100). Currently, the
 *      Raspberry Pi server uses a fixed speed of 85%, but this architecture
 *      allows for future implementation of variable speed control by passing
 *      this value as a query parameter to motor control endpoints.
 *
 * 2. AI DOMAIN (ai):
 *    Settings for the YOLO-based computer vision pipeline (prepared but not
 *    yet fully implemented).
 *
 *    - personDetection: When true, the AI pipeline will specifically identify
 *      and track human figures in the video stream.
 *
 *    - objectDetection: When true, enables general object detection beyond
 *      just persons (vehicles, animals, everyday objects, etc.).
 *
 *    - confidence: Minimum confidence threshold (0-100) for YOLO detections.
 *      Detections below this threshold are discarded. Higher values reduce
 *      false positives but may miss valid detections.
 *
 *    - temperature: Controls inference randomness/creativity. In detection
 *      contexts, this typically affects non-maximum suppression (NMS)
 *      behavior and bounding box refinement.
 *
 * PERSISTENCE:
 * This type is serialized to JSON and stored under the "kanshi.config" key
 * in localStorage. The ConfigStore class handles merging stored values with
 * defaults to ensure forward compatibility when new fields are added.
 */
export type AppConfig = {
  control: {
    speedPercent: number;
  };
  ai: {
    personDetection: boolean;
    objectDetection: boolean;
    confidence: number;
    temperature: number;
  };
};

/**
 * CONTROL SOURCE TYPE
 *
 * Identifies the origin of a robot control command, enabling the system to
 * track and log how commands were initiated. This is valuable for:
 *   - Session logging and analytics
 *   - Debugging input handling issues
 *   - Potential future features like command prioritization
 *
 * VALUES:
 * - "keyboard": Command originated from WASD key press on physical keyboard.
 *               These commands follow a keydown→command, keyup→stop pattern.
 *
 * - "ui": Command originated from clicking on-screen control buttons in the
 *         web interface. These may use mousedown/mouseup or touch events.
 *
 * - "system": Command originated from automated system behavior, such as
 *             emergency stops, session cleanup, or future AI-driven control.
 *             Reserved for non-user-initiated commands.
 */
export type ControlSource = "keyboard" | "ui" | "system";

/**
 * STREAM STATUS TYPE
 *
 * Represents the current state of the MJPEG video stream connection to the
 * Raspberry Pi's camera module. This status drives UI feedback and triggers
 * automatic reconnection logic.
 *
 * STATE MACHINE:
 * The stream typically transitions through these states:
 *
 *   [Initial] → "connecting" → "live" → (connection lost) → "error"
 *                    ↑                                          │
 *                    └──────── (auto-reconnect) ────────────────┘
 *
 * VALUES:
 * - "connecting": Initial connection attempt or reconnection in progress.
 *                 UI should display a loading indicator.
 *
 * - "live": Stream is actively receiving frames from the Raspberry Pi.
 *           Video element should be visible and playing.
 *
 * - "error": Connection failed or stream was interrupted. An optional error
 *            message provides details. The StreamService will automatically
 *            attempt reconnection with exponential backoff.
 *
 * The stream URL (http://192.168.4.1:8080/?action=stream) serves MJPEG
 * directly from mjpg_streamer running on the Raspberry Pi.
 */
export type StreamStatus = "connecting" | "live" | "error";

/**
 * APPLICATION EVENTS TYPE
 *
 * Defines the complete event contract for Kanshi's event-driven architecture.
 * This type serves as the generic parameter for the EventBus class, ensuring
 * type-safe event emission and subscription throughout the application.
 *
 * ARCHITECTURAL PATTERN:
 * Kanshi uses a publish-subscribe (pub/sub) pattern to decouple components.
 * Instead of direct method calls, components communicate by:
 *   1. Emitting events with typed payloads
 *   2. Subscribing to events they care about
 *
 * This enables loose coupling, easier testing, and flexible component
 * composition without creating dependency cycles.
 *
 * EVENT CATALOG:
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVENT: "control:command"
 * ─────────────────────────────────────────────────────────────────────────────
 * Fired when a user initiates a robot control action (before network request).
 *
 * Payload:
 *   - command: The RobotCommand to execute ("forward", "stop", etc.)
 *   - source: Where the command originated (ControlSource)
 *
 * Publishers: InputController (keyboard/UI input handling)
 * Subscribers: ControlController (sends command to Raspberry Pi)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVENT: "control:sent"
 * ─────────────────────────────────────────────────────────────────────────────
 * Fired after a command has been sent to the Raspberry Pi (after network request).
 *
 * Payload:
 *   - command: The RobotCommand that was sent
 *   - latencyMs: Round-trip time in milliseconds, or null if request failed
 *   - ok: Whether the HTTP request succeeded (status 2xx)
 *
 * Publishers: RobotControlService (after HTTP request completes)
 * Subscribers: StatusHud (displays latency), SessionLogger (logs events)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVENT: "stream:status"
 * ─────────────────────────────────────────────────────────────────────────────
 * Fired when the video stream connection state changes.
 *
 * Payload:
 *   - status: Current StreamStatus ("connecting", "live", "error")
 *   - error: Optional error message when status is "error"
 *
 * Publishers: StreamService (monitors MJPEG connection)
 * Subscribers: StreamController (updates UI), StatusHud (shows connection state)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVENT: "session:start"
 * ─────────────────────────────────────────────────────────────────────────────
 * Fired when a new monitoring/control session begins.
 *
 * Payload:
 *   - sessionId: Unique identifier for the session (UUID format)
 *
 * Publishers: SessionController (on page load or manual session start)
 * Subscribers: SessionLogger (initializes session record)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVENT: "session:stop"
 * ─────────────────────────────────────────────────────────────────────────────
 * Fired when a monitoring/control session ends.
 *
 * Payload:
 *   - sessionId: Identifier of the ending session
 *   - reason: Optional explanation ("user_action", "page_unload", etc.)
 *
 * Publishers: SessionController (on page unload or manual session stop)
 * Subscribers: SessionLogger (finalizes session record)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVENT: "config:changed"
 * ─────────────────────────────────────────────────────────────────────────────
 * Fired when application configuration is modified.
 *
 * Payload:
 *   - config: The complete new AppConfig after changes
 *
 * Publishers: ConfigStore (after setConfig or update)
 * Subscribers: Any component needing to react to config changes
 *              (AI pipeline, control service, etc.)
 */
export type AppEvents = {
  "control:command": { command: RobotCommand; source: ControlSource };
  "control:sent": {
    command: RobotCommand;
    latencyMs: number | null;
    ok: boolean;
  };
  "stream:status": { status: StreamStatus; error?: string };
  "session:start": { sessionId: string };
  "session:stop": { sessionId: string; reason?: string };
  "config:changed": { config: AppConfig };
};
