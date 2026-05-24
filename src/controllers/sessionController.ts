/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - SESSION CONTROLLER
 * =============================================================================
 *
 * File: src/controllers/sessionController.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The SessionController manages the lifecycle of monitoring sessions and
 * coordinates event logging. A "session" represents a discrete period of
 * robot operation, capturing all control commands, network events, and
 * (future) AI detections for later review and analysis.
 *
 * SESSION CONCEPT:
 * Sessions serve as organizational units for Kanshi activity:
 *
 *   [Session Start]
 *        ↓
 *   [Robot Control Events]     ← Logged
 *   [Stream Status Changes]    ← Logged
 *   [AI Detections (future)]   ← Logged
 *        ↓
 *   [Session End]
 *        ↓
 *   [Session Saved to Storage]
 *
 * USE CASES FOR SESSION DATA:
 *   - Reviewing robot behavior after an operation
 *   - Analyzing control patterns and response times
 *   - Debugging connectivity issues via status logs
 *   - Training data collection for AI improvements
 *   - Compliance/audit trails for monitored operations
 *
 * UI INTEGRATION:
 * The controller manages session toggle buttons (Start/Stop Session)
 * found in the UI. Button text updates dynamically to reflect the
 * current session state.
 *
 * EVENT LOGGING:
 * The controller subscribes to key application events and forwards
 * them to the SessionLogger for persistent storage. This centralized
 * approach ensures consistent event capture without requiring each
 * component to know about the logging system.
 *
 * =============================================================================
 */

import type { AppEvents } from "../config/types";
import type { EventBus } from "../services/eventBus";
import { SessionLogger } from "../logging/sessionLogger";

/**
 * SESSION CONTROLLER CLASS
 *
 * Manages session lifecycle and coordinates event logging.
 *
 * This controller serves as the central point for:
 *   - Starting and stopping sessions via UI buttons
 *   - Capturing events from the EventBus for logging
 *   - Updating UI to reflect session state
 *   - Emitting session lifecycle events
 *
 * DUAL ROLE:
 * The SessionController both produces and consumes events:
 *
 *   CONSUMES:
 *   - control:command → logs to session
 *   - control:sent → logs to session
 *   - stream:status → logs to session
 *
 *   PRODUCES:
 *   - session:start → notifies system of new session
 *   - session:stop → notifies system of ended session
 *
 * SESSION STATE:
 * The actual session state is maintained by SessionLogger.
 * The controller queries hasActiveSession() to determine
 * current state and update UI accordingly.
 */
export class SessionController {
  /**
   * SESSION TOGGLE BUTTONS
   *
   * References to all UI buttons that can start/stop sessions.
   * Multiple buttons may exist across different pages or UI sections.
   *
   * These buttons are identified by the data-session-toggle attribute.
   */
  private buttons: HTMLButtonElement[] = [];

  /**
   * CONSTRUCTOR
   *
   * Initializes the SessionController with required dependencies.
   *
   * @param bus - EventBus for subscribing to events and emitting
   *              session lifecycle events.
   *
   * @param logger - SessionLogger instance for creating sessions
   *                 and logging events to persistent storage.
   *
   * DEPENDENCY RELATIONSHIP:
   * The EventBus enables loose coupling between event sources
   * (InputController, RobotControlService, StreamService) and
   * the logging system. Components don't need to know about
   * logging; they just emit events.
   */
  constructor(
    private bus: EventBus<AppEvents>,
    private logger: SessionLogger,
  ) {}

  /**
   * INITIALIZE CONTROLLER
   *
   * Sets up UI event handlers and event subscriptions.
   *
   * INITIALIZATION SEQUENCE:
   *
   *   1. FIND SESSION TOGGLE BUTTONS
   *      Locate all buttons with data-session-toggle attribute.
   *      These buttons control session start/stop.
   *
   *   2. ATTACH CLICK HANDLERS
   *      Each button triggers toggleSession() when clicked.
   *
   *   3. UPDATE INITIAL BUTTON STATE
   *      Set button text based on current session state
   *      (may resume from previous page load).
   *
   *   4. SUBSCRIBE TO LOGGABLE EVENTS
   *      Listen for events that should be recorded in the session.
   *
   * EVENT LOGGING STRATEGY:
   * We log three categories of events:
   *
   *   - control:command
   *     User input events (before network transmission).
   *     Shows what the user intended to do.
   *
   *   - control:sent
   *     Network response events (after HTTP round-trip).
   *     Shows whether commands succeeded and their latency.
   *
   *   - stream:status
   *     Video stream state changes.
   *     Shows connection stability over time.
   */
  init(): void {
    /*
     * FIND SESSION TOGGLE BUTTONS
     *
     * Convert NodeList to Array for easier iteration.
     * These buttons use the data-session-toggle attribute
     * as a marker (value doesn't matter, presence is enough).
     */
    this.buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-session-toggle]"),
    );

    /*
     * ATTACH CLICK HANDLERS
     *
     * Each button triggers the same toggleSession() method.
     * Multiple buttons allow session control from different
     * UI locations without code duplication.
     */
    this.buttons.forEach((button) => {
      button.addEventListener("click", () => this.toggleSession());
    });

    /*
     * INITIALIZE BUTTON TEXT
     *
     * Set correct text based on current session state.
     * This handles cases where:
     *   - Page loads with no active session → "START SESSION"
     *   - Page reloads with active session → "STOP SESSION"
     */
    this.updateButtons();

    /*
     * SUBSCRIBE TO CONTROL COMMAND EVENTS
     *
     * Log user input events as they occur.
     * The payload includes:
     *   - command: "forward", "backward", "left", "right", "stop"
     *   - source: "keyboard", "ui", "system"
     *
     * Event type "control.command" (with dot) follows logging conventions.
     */
    this.bus.on("control:command", (payload) => {
      this.logger.logEvent("control.command", payload);
    });

    /*
     * SUBSCRIBE TO CONTROL SENT EVENTS
     *
     * Log network response events after HTTP round-trip.
     * The payload includes:
     *   - command: the command that was sent
     *   - latencyMs: round-trip time (null if failed)
     *   - ok: whether the request succeeded
     *
     * This data enables post-session analysis of:
     *   - Command success rates
     *   - Network latency patterns
     *   - Connectivity issues
     */
    this.bus.on("control:sent", (payload) => {
      this.logger.logEvent("control.sent", payload);
    });

    /*
     * SUBSCRIBE TO STREAM STATUS EVENTS
     *
     * Log video stream state changes.
     * The payload includes:
     *   - status: "connecting", "live", "error"
     *   - error: optional error message
     *
     * This tracks video reliability over the session,
     * useful for diagnosing Wi-Fi or hardware issues.
     */
    this.bus.on("stream:status", (payload) => {
      this.logger.logEvent("stream.status", payload);
    });
  }

  /**
   * TOGGLE SESSION STATE
   *
   * Starts a new session if none active, or stops the current session.
   * Called when any session toggle button is clicked.
   *
   * TOGGLE LOGIC:
   *
   *   IF hasActiveSession():
   *     → Stop the current session
   *     → Emit session:stop event
   *
   *   ELSE:
   *     → Start a new session
   *     → Emit session:start event
   *
   * SESSION EVENTS:
   * Emitting session:start and session:stop enables other components
   * to react to session lifecycle changes without directly depending
   * on the SessionController.
   *
   * UI UPDATE:
   * After toggling, updateButtons() synchronizes button text with
   * the new session state.
   */
  private toggleSession(): void {
    if (this.logger.hasActiveSession()) {
      /*
       * STOP ACTIVE SESSION
       *
       * Call stopSession with "manual" reason to indicate
       * user-initiated stop (vs. automatic stop on page unload).
       *
       * The returned session object (if any) contains the
       * session ID needed for the stop event.
       */
      const session = this.logger.stopSession("manual");
      if (session) {
        this.bus.emit("session:stop", {
          sessionId: session.id,
          reason: "manual",
        });
      }
    } else {
      /*
       * START NEW SESSION
       *
       * Creates a new session record in the logger.
       * Returns the session object with its generated ID.
       *
       * The session:start event notifies other components
       * that a new session has begun.
       */
      const session = this.logger.startSession();
      this.bus.emit("session:start", { sessionId: session.id });
    }

    /*
     * Update all button text to reflect the new state.
     */
    this.updateButtons();
  }

  /**
   * UPDATE BUTTON TEXT
   *
   * Synchronizes all session toggle buttons with current session state.
   *
   * BUTTON STATES:
   *   - Active session: "STOP SESSION" (clicking will end session)
   *   - No active session: "START SESSION" (clicking will begin session)
   *
   * MULTIPLE BUTTONS:
   * All buttons are updated together to maintain UI consistency.
   * Users may have the main dashboard and settings page open in
   * different tabs, and both should reflect the same state.
   *
   * Note: Cross-tab synchronization isn't implemented; this only
   * updates buttons within the current page.
   */
  private updateButtons(): void {
    const active = this.logger.hasActiveSession();
    this.buttons.forEach((button) => {
      button.textContent = active ? "STOP SESSION" : "START SESSION";
    });
  }
}
