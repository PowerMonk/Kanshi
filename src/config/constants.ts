/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - SYSTEM CONSTANTS
 * =============================================================================
 *
 * File: src/config/constants.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * This module centralizes all constant values used throughout the Kanshi
 * desktop application. By consolidating magic numbers, URLs, and configuration
 * keys in a single location, we achieve:
 *   - Single source of truth for system-wide values
 *   - Easy reconfiguration without hunting through multiple files
 *   - Clear documentation of system parameters and their purposes
 *   - Compile-time verification of constant references
 *
 * NETWORK ARCHITECTURE:
 * The constants defined here establish the communication layer between the
 * desktop PC and the Raspberry Pi. The Pi operates as a WiFi hotspot with
 * a fixed IP address (192.168.4.1), ensuring predictable connectivity in
 * the field without requiring external network infrastructure.
 *
 * TIMING PARAMETERS:
 * The timing constants are carefully tuned to balance responsiveness with
 * system stability. These values were determined through empirical testing
 * to provide smooth operation over the local WiFi link.
 *
 * =============================================================================
 */

/**
 * RASPBERRY PI HOST ADDRESS
 *
 * Base URL for the Raspberry Pi when operating as a WiFi access point.
 *
 * NETWORK TOPOLOGY:
 * The Raspberry Pi runs hostapd to create a standalone WiFi network with
 * SSID configured for the Kanshi system. When connected to this network,
 * the Pi is always reachable at this static IP address.
 *
 * IP: 192.168.4.1 - Standard first host address in the Pi's DHCP range
 * Protocol: HTTP (not HTTPS) - Acceptable for local-only communication
 *
 * This constant serves as the base for constructing service-specific URLs.
 * Direct usage is discouraged; prefer STREAM_URL and CONTROL_URL below.
 */
export const PI_HOST = "http://192.168.4.1";

/**
 * MJPEG VIDEO STREAM URL
 *
 * Complete URL for the live video feed from the Raspberry Pi camera module.
 *
 * SERVICE DETAILS:
 * The Raspberry Pi runs mjpg_streamer, a lightweight streaming server that:
 *   - Captures frames from the Pi Camera Module (or USB camera)
 *   - Encodes frames as JPEG images
 *   - Serves them as a multipart MJPEG stream over HTTP
 *
 * URL BREAKDOWN:
 *   - Host: 192.168.4.1 (Raspberry Pi on its own hotspot)
 *   - Port: 8080 (mjpg_streamer default port)
 *   - Path: / (root of the streaming server)
 *   - Query: ?action=stream (tells mjpg_streamer to serve continuous MJPEG)
 *
 * MJPEG FORMAT:
 * The stream uses multipart/x-mixed-replace content type, sending continuous
 * JPEG frames separated by boundary markers. This format is natively supported
 * by HTML <img> elements, enabling simple display without JavaScript decoding.
 *
 * ALTERNATIVE ACTIONS:
 * mjpg_streamer supports other actions like ?action=snapshot for single frames,
 * but for real-time monitoring, the stream action provides lowest latency.
 */
export const STREAM_URL = "http://192.168.4.1:8080/?action=stream";

/**
 * ROBOT CONTROL API URL
 *
 * Base URL for the Flask server that handles motor control commands.
 *
 * SERVICE DETAILS:
 * The Raspberry Pi runs a Flask application (server-side.py) that:
 *   - Listens for HTTP GET requests on specific endpoints
 *   - Translates requests into GPIO PWM signals
 *   - Controls the L298N motor driver (or similar H-bridge module)
 *
 * ENDPOINT MAPPING:
 *   GET /forward  → Both motors forward at configured speed
 *   GET /backward → Both motors reverse at configured speed
 *   GET /left     → Differential turn: right forward, left reverse
 *   GET /right    → Differential turn: left forward, right reverse
 *   GET /stop     → All motor outputs set to zero
 *
 * WHY HTTP GET (not POST)?
 * For simplicity and browser compatibility. These are idempotent commands
 * (calling /forward twice has the same effect as calling it once while
 * the robot is already moving forward). REST purists might prefer POST,
 * but GET simplifies testing and reduces implementation complexity on
 * the resource-constrained Pi.
 *
 * PORT SELECTION:
 * Port 5000 is Flask's default development port. In this embedded context,
 * it serves as the production port since the Pi isn't exposed to the internet.
 */
export const CONTROL_URL = "http://192.168.4.1:5000";

/**
 * LOCAL STORAGE KEYS
 *
 * Namespace-prefixed keys for browser localStorage persistence.
 *
 * STORAGE STRATEGY:
 * All Kanshi data persisted to localStorage uses the "kanshi." prefix to:
 *   - Avoid collisions with other applications
 *   - Enable easy identification of Kanshi data
 *   - Allow bulk operations (clear all Kanshi data)
 *
 * KEY DESCRIPTIONS:
 *
 * config ("kanshi.config"):
 *   Stores the serialized AppConfig object containing user preferences
 *   for motor speed and AI detection settings. Loaded on application
 *   start and updated whenever the user modifies settings.
 *
 * sessions ("kanshi.sessions"):
 *   Stores an array of SessionRecord objects containing historical data
 *   about past control sessions. Each session includes timestamps, events,
 *   and optionally, AI detection records. Used by the Session Logs page.
 *
 * activeSessionId ("kanshi.activeSessionId"):
 *   Stores the UUID of the currently active session. This enables session
 *   continuity across page reloads within the same browser tab. If present
 *   on load, the application resumes the existing session rather than
 *   creating a new one.
 *
 * STORAGE LIMITS:
 * Browser localStorage typically provides 5-10 MB of storage. Session
 * data should be periodically pruned to prevent exhaustion. The
 * SessionLogger class handles this by limiting stored session count.
 */
export const STORAGE_KEYS = {
  config: "kanshi.config",
  sessions: "kanshi.sessions",
  activeSessionId: "kanshi.activeSessionId",
};

/**
 * COMMAND COOLDOWN PERIOD (Milliseconds)
 *
 * Minimum time between consecutive robot control commands.
 *
 * PURPOSE:
 * Prevents command flooding when users hold down movement keys or rapidly
 * tap buttons. Without this cooldown:
 *   - The Flask server could be overwhelmed with requests
 *   - Network congestion could increase latency for all commands
 *   - The motor driver might exhibit erratic behavior from rapid state changes
 *
 * VALUE RATIONALE (120ms):
 * This value allows approximately 8 commands per second, which provides
 * responsive control while preventing spam. The human reaction time for
 * intentional input changes is typically 150-300ms, so 120ms captures
 * intentional inputs without allowing accidental rapid-fire.
 *
 * IMPLEMENTATION:
 * The RobotControlService tracks the timestamp of the last sent command.
 * New commands within the cooldown window are silently dropped (not queued),
 * as the most recent state is what matters for motor control.
 */
export const COMMAND_COOLDOWN_MS = 120;

/**
 * CONTROL REQUEST TIMEOUT (Milliseconds)
 *
 * Maximum time to wait for a response from the Raspberry Pi control server.
 *
 * PURPOSE:
 * Network requests can hang indefinitely without a timeout, leaving the UI
 * in an uncertain state. This timeout ensures:
 *   - Failed requests are detected promptly
 *   - The UI can show error states quickly
 *   - Resources aren't tied up waiting for dead connections
 *
 * VALUE RATIONALE (1200ms):
 * On a local WiFi connection, round-trip times should be under 50ms.
 * The generous 1200ms timeout accounts for:
 *   - WiFi interference or signal degradation
 *   - Momentary Pi processor load spikes
 *   - Brief network interruptions
 *
 * If a request takes longer than 1200ms, the connection is likely degraded
 * enough that real-time control isn't feasible anyway.
 *
 * IMPLEMENTATION:
 * The httpClient module wraps fetch() with AbortController to enforce
 * this timeout. Timed-out requests are treated as failed commands.
 */
export const CONTROL_REQUEST_TIMEOUT_MS = 1200;

/**
 * STREAM RECONNECTION BASE DELAY (Milliseconds)
 *
 * Initial delay before attempting to reconnect a dropped video stream.
 *
 * PURPOSE:
 * When the MJPEG stream disconnects (network issue, Pi reboot, etc.),
 * immediate reconnection attempts often fail if the underlying problem
 * persists. This base delay:
 *   - Gives transient issues time to resolve
 *   - Prevents hammering the server with rapid reconnection attempts
 *   - Reduces unnecessary network traffic and CPU usage
 *
 * VALUE RATIONALE (750ms):
 * Short enough to feel responsive for brief glitches, but long enough
 * to avoid rapid-fire reconnection attempts. This is the starting point
 * for exponential backoff (see STREAM_RECONNECT_MAX_MS).
 *
 * EXPONENTIAL BACKOFF SEQUENCE:
 * 750ms → 1500ms → 3000ms → 5000ms (capped at max)
 *
 * IMPLEMENTATION:
 * The StreamService multiplies the delay by 2 after each failed attempt,
 * capping at STREAM_RECONNECT_MAX_MS. Successful connection resets the
 * delay to the base value.
 */
export const STREAM_RECONNECT_BASE_MS = 750;

/**
 * STREAM RECONNECTION MAXIMUM DELAY (Milliseconds)
 *
 * Maximum delay between video stream reconnection attempts.
 *
 * PURPOSE:
 * Caps the exponential backoff to prevent excessively long waits between
 * reconnection attempts. Even if the Pi is offline for an extended period,
 * we want to detect its return within a reasonable timeframe.
 *
 * VALUE RATIONALE (5000ms):
 * At 5 seconds between attempts, the system checks for recovery frequently
 * enough to resume operation promptly when the Pi comes back online, while
 * not wasting resources on constant polling during extended outages.
 *
 * PRACTICAL SCENARIOS:
 * - Pi temporarily out of WiFi range: Reconnects within 5 seconds of return
 * - Pi rebooting: Reconnects shortly after boot completes
 * - Permanent failure: Attempts every 5 seconds until user intervention
 *
 * IMPLEMENTATION:
 * When the calculated backoff delay exceeds this value, it's clamped to
 * this maximum. The delay remains at this level until successful connection.
 */
export const STREAM_RECONNECT_MAX_MS = 5000;
