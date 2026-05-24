/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - SESSION LOGGER
 * =============================================================================
 *
 * File: src/logging/sessionLogger.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The SessionLogger provides comprehensive session management and event
 * logging for the Kanshi system. It enables operators to review historical
 * robot operations, analyze control patterns, and export data for external
 * analysis.
 *
 * SESSION CONCEPT:
 * A session represents a discrete period of robot operation, capturing:
 *   - Start and end timestamps
 *   - Human-readable title
 *   - All events that occurred (commands, network responses, stream status)
 *   - (Future) AI detection records
 *
 * DATA PERSISTENCE:
 * All session data is stored in browser localStorage, providing:
 *   - Persistence across page reloads and browser restarts
 *   - No server-side storage requirements
 *   - Instant access without network latency
 *
 * STORAGE STRUCTURE:
 *
 *   localStorage["kanshi.sessions"] = [
 *     {
 *       id: "uuid-...",
 *       title: "Mission Today 14:30",
 *       startedAt: 1705334400000,
 *       endedAt: 1705341600000,
 *       events: [
 *         { timestamp: ..., type: "control.command", data: {...} },
 *         { timestamp: ..., type: "control.sent", data: {...} },
 *         ...
 *       ]
 *     },
 *     ...
 *   ]
 *
 *   localStorage["kanshi.activeSessionId"] = "uuid-..." | null
 *
 * SESSION LIFECYCLE:
 *
 *   [User clicks "Start Session"]
 *        ↓
 *   startSession() → Creates new session, stores ID
 *        ↓
 *   [Events logged via logEvent()]
 *        ↓
 *   [User clicks "Stop Session" or page unloads]
 *        ↓
 *   stopSession() → Sets endedAt, clears active ID
 *
 * EVENT LOGGING:
 * Events are appended to the active session's events array:
 *
 *   logEvent("control.command", { command: "forward", source: "keyboard" })
 *   logEvent("control.sent", { command: "forward", latencyMs: 23, ok: true })
 *   logEvent("stream.status", { status: "live" })
 *
 * =============================================================================
 */

import { STORAGE_KEYS } from "../config/constants";
import { StorageService } from "../services/storageService";
import { formatDateLabel, formatTimeLabel } from "../services/timeService";

/**
 * SESSION EVENT TYPE
 *
 * Represents a single logged event within a session.
 *
 * Events capture discrete occurrences during robot operation:
 *   - User input actions
 *   - Network responses
 *   - Stream state changes
 *   - AI detections (future)
 *
 * EVENT STRUCTURE:
 *   - timestamp: When the event occurred (Unix ms)
 *   - type: Dot-notation event category (e.g., "control.command")
 *   - data: Event-specific payload (varies by type)
 */
export type SessionEvent = {
  /**
   * EVENT TIMESTAMP
   *
   * Unix timestamp in milliseconds when the event was logged.
   * Used for:
   *   - Chronological event ordering
   *   - Duration calculations
   *   - Timeline visualization
   */
  timestamp: number;

  /**
   * EVENT TYPE
   *
   * Dot-notation string categorizing the event.
   *
   * CURRENT EVENT TYPES:
   *   - "session.start": Session began
   *   - "session.stop": Session ended
   *   - "control.command": User input received
   *   - "control.sent": Command sent to Pi
   *   - "stream.status": Video stream state change
   *
   * FUTURE EVENT TYPES:
   *   - "ai.detection": Object detected by YOLO
   *   - "ai.alert": Detection above alert threshold
   */
  type: string;

  /**
   * EVENT DATA
   *
   * Event-specific payload containing relevant details.
   * Structure varies by event type.
   *
   * EXAMPLES BY TYPE:
   *
   *   "control.command":
   *     { command: "forward", source: "keyboard" }
   *
   *   "control.sent":
   *     { command: "forward", latencyMs: 23, ok: true }
   *
   *   "stream.status":
   *     { status: "live" }
   *
   * The optional nature (?) allows events without data payloads.
   */
  data?: unknown;
};

/**
 * SESSION TYPE
 *
 * Represents a complete session record.
 *
 * Sessions are the top-level unit of organization for logged data.
 * Each session contains all events from a single operation period.
 */
export type Session = {
  /**
   * SESSION ID
   *
   * Unique identifier for the session.
   * Format: UUID v4 (e.g., "f47ac10b-58cc-4372-a567-0e02b2c3d479")
   * Fallback: "session-{timestamp}-{random}" if crypto.randomUUID unavailable
   */
  id: string;

  /**
   * SESSION TITLE
   *
   * Human-readable session name.
   * Auto-generated from start timestamp: "Mission Today 14:30"
   * Can be customized via startSession(title) parameter.
   */
  title: string;

  /**
   * START TIMESTAMP
   *
   * Unix timestamp (ms) when the session began.
   * Used for:
   *   - Sorting sessions chronologically
   *   - Calculating session duration
   *   - Display formatting
   */
  startedAt: number;

  /**
   * END TIMESTAMP
   *
   * Unix timestamp (ms) when the session ended.
   * Undefined while session is active.
   * Set by stopSession() when session concludes.
   */
  endedAt?: number;

  /**
   * SESSION EVENTS
   *
   * Array of all events logged during the session.
   * Events are appended in chronological order.
   * May contain hundreds of events for long sessions.
   */
  events: SessionEvent[];
};

/**
 * SESSION LOGGER CLASS
 *
 * Manages session lifecycle and event logging.
 *
 * This class provides the core logging functionality for Kanshi:
 *   - Create and manage sessions
 *   - Log events to active sessions
 *   - Retrieve historical session data
 *   - Export sessions for external analysis
 *
 * SINGLETON PATTERN:
 * While not enforced, typically one SessionLogger instance is used
 * per page, shared across all components that need to log events.
 *
 * STORAGE DELEGATION:
 * All persistence is delegated to StorageService, enabling:
 *   - Consistent JSON serialization
 *   - Easy testing with mock storage
 *   - Future migration to different backends
 */
export class SessionLogger {
  /**
   * CONSTRUCTOR
   *
   * @param storage - StorageService instance for data persistence.
   *                  The logger uses this for all localStorage operations.
   */
  constructor(private storage: StorageService) {}

  /**
   * GET ALL SESSIONS
   *
   * Retrieves all stored sessions in reverse chronological order.
   *
   * @returns Array of Session objects, newest first.
   *          Returns empty array if no sessions exist.
   *
   * SORTING:
   * Sessions are sorted by startedAt timestamp descending,
   * ensuring the most recent session appears first.
   *
   * This is the primary data source for the Session Logs page.
   */
  getSessions(): Session[] {
    /*
     * Load sessions from storage with empty array fallback.
     */
    const sessions = this.storage.getJSON<Session[]>(STORAGE_KEYS.sessions, []);

    /*
     * Sort by start time descending (newest first).
     * b - a gives descending order.
     */
    return sessions.sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * GET ACTIVE SESSION ID
   *
   * Retrieves the ID of the currently active session, if any.
   *
   * @returns Session ID string, or null if no session is active.
   *
   * The active session ID is stored separately from the sessions
   * array for quick access without parsing all session data.
   */
  getActiveSessionId(): string | null {
    return this.storage.getJSON<string | null>(
      STORAGE_KEYS.activeSessionId,
      null,
    );
  }

  /**
   * CHECK FOR ACTIVE SESSION
   *
   * Convenience method to check if a session is currently active.
   *
   * @returns true if a session is active, false otherwise.
   *
   * Used by UI components to determine button states and
   * whether to log events.
   */
  hasActiveSession(): boolean {
    return this.getActiveSessionId() !== null;
  }

  /**
   * START NEW SESSION
   *
   * Creates a new session and marks it as active.
   *
   * @param title - Optional custom title. If not provided,
   *                auto-generates from current date/time.
   *
   * @returns The newly created Session object.
   *
   * SESSION CREATION PROCESS:
   *   1. Load existing sessions
   *   2. Generate unique ID and timestamp
   *   3. Create session object
   *   4. Prepend to sessions array (newest first)
   *   5. Persist updated sessions
   *   6. Store active session ID
   *   7. Log "session.start" event
   *
   * TITLE GENERATION:
   * Auto-generated titles follow the pattern:
   *   "Mission {Date} {Time}"
   *   Example: "Mission Today 14:30"
   *
   * This provides readable identification without user input.
   */
  startSession(title?: string): Session {
    /*
     * Load current sessions to prepend the new one.
     */
    const sessions = this.getSessions();
    const now = Date.now();

    /*
     * Create the new session object.
     * ID is generated via createId() helper.
     * Title is provided or auto-generated.
     */
    const session: Session = {
      id: createId(),
      title: title ?? buildSessionTitle(now),
      startedAt: now,
      events: [],
    };

    /*
     * Prepend to maintain newest-first order.
     * unshift() adds to array beginning.
     */
    sessions.unshift(session);

    /*
     * Persist the updated sessions array.
     */
    this.storage.setJSON(STORAGE_KEYS.sessions, sessions);

    /*
     * Mark this session as active.
     */
    this.storage.setJSON(STORAGE_KEYS.activeSessionId, session.id);

    /*
     * Log the session start as the first event.
     */
    this.logEvent("session.start", { sessionId: session.id });

    return session;
  }

  /**
   * STOP ACTIVE SESSION
   *
   * Ends the currently active session and clears the active marker.
   *
   * @param reason - Optional reason for stopping (e.g., "manual", "page_unload")
   *
   * @returns The stopped Session object, or null if no session was active.
   *
   * SESSION STOP PROCESS:
   *   1. Get active session ID
   *   2. If no active session, return null
   *   3. Find session in sessions array
   *   4. Set endedAt timestamp
   *   5. Log "session.stop" event
   *   6. Persist updated sessions
   *   7. Clear active session ID
   *
   * ORPHAN CLEANUP:
   * If the active session ID references a non-existent session
   * (possible data corruption), the ID is cleared without error.
   */
  stopSession(reason?: string): Session | null {
    const activeId = this.getActiveSessionId();

    /*
     * No active session to stop.
     */
    if (!activeId) {
      return null;
    }

    const sessions = this.getSessions();
    const session = sessions.find((item) => item.id === activeId);

    /*
     * Handle orphaned active ID (session was deleted but ID remains).
     * Clear the ID to restore consistent state.
     */
    if (!session) {
      this.storage.remove(STORAGE_KEYS.activeSessionId);
      return null;
    }

    /*
     * Set the end timestamp.
     */
    session.endedAt = Date.now();

    /*
     * Persist the updated session with endedAt.
     */
    this.storage.setJSON(STORAGE_KEYS.sessions, sessions);

    /*
     * Log the session stop event.
     * This is the last event in the session.
     */
    this.logEvent("session.stop", { sessionId: session.id, reason });

    /*
     * Clear the active session marker.
     */
    this.storage.remove(STORAGE_KEYS.activeSessionId);

    return session;
  }

  /**
   * LOG EVENT TO ACTIVE SESSION
   *
   * Appends an event to the currently active session.
   *
   * @param type - Event type string (e.g., "control.command")
   * @param data - Optional event payload data
   *
   * If no session is active, the event is silently discarded.
   * This allows event logging to be called without checking
   * session state first.
   *
   * PERFORMANCE CONSIDERATION:
   * Each logEvent call reads, modifies, and writes the entire
   * sessions array. For high-frequency events, consider batching
   * or optimizing storage access in the future.
   */
  logEvent(type: string, data?: unknown): void {
    const activeId = this.getActiveSessionId();

    /*
     * No active session - discard the event.
     */
    if (!activeId) {
      return;
    }

    const sessions = this.getSessions();
    const session = sessions.find((item) => item.id === activeId);

    /*
     * Session not found (shouldn't happen normally).
     */
    if (!session) {
      return;
    }

    /*
     * Append the event with current timestamp.
     */
    session.events.push({ timestamp: Date.now(), type, data });

    /*
     * Persist the updated sessions.
     */
    this.storage.setJSON(STORAGE_KEYS.sessions, sessions);
  }

  /**
   * EXPORT SESSION AS JSON
   *
   * Serializes a session to a JSON string for download/external use.
   *
   * @param id - The session ID to export
   *
   * @returns Pretty-printed JSON string of the session,
   *          or "null" if session not found.
   *
   * OUTPUT FORMAT:
   * The JSON is formatted with 2-space indentation for readability.
   * This makes it suitable for direct viewing and analysis.
   *
   * USE CASES:
   *   - Download for archival
   *   - Analysis in external tools (Python, etc.)
   *   - Sharing for debugging support
   *   - Long-term storage beyond localStorage limits
   */
  exportSession(id: string): string {
    const sessions = this.getSessions();
    const session = sessions.find((item) => item.id === id);

    /*
     * Pretty-print with 2-space indentation.
     * Returns "null" string if session not found.
     */
    return JSON.stringify(session ?? null, null, 2);
  }
}

/**
 * CREATE UNIQUE ID
 *
 * Generates a unique identifier for sessions.
 *
 * Uses crypto.randomUUID() when available (modern browsers).
 * Falls back to timestamp + random string for older browsers.
 *
 * @returns Unique ID string
 *
 * UUID FORMAT:
 *   Standard: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 *   Fallback: "session-1705334400000-a1b2c3d4e5f6"
 *
 * The fallback format is less standard but provides sufficient
 * uniqueness for session identification.
 */
function createId(): string {
  /*
   * Check for crypto.randomUUID support.
   * Available in modern browsers and secure contexts.
   */
  if ("crypto" in window && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  /*
   * Fallback for older browsers or insecure contexts.
   * Combines timestamp with random hex string.
   */
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * BUILD SESSION TITLE
 *
 * Generates a human-readable title from a timestamp.
 *
 * @param timestamp - Unix timestamp in milliseconds
 *
 * @returns Title string in format "Mission {Date} {Time}"
 *
 * EXAMPLES:
 *   - Today's session: "Mission Today 14:30"
 *   - Past session: "Mission Jan 15, 2025 09:15"
 *
 * The "Mission" prefix creates a consistent theme for session
 * naming that fits the Kanshi robot monitoring use case.
 */
function buildSessionTitle(timestamp: number): string {
  const date = new Date(timestamp);

  /*
   * Use time service formatters for consistent display.
   * formatDateLabel returns "Today" for current day.
   * formatTimeLabel returns locale-appropriate time format.
   */
  return `Mission ${formatDateLabel(date)} ${formatTimeLabel(date)}`;
}
