/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - SESSION LOGS CONTROLLER
 * =============================================================================
 *
 * File: src/controllers/sessionLogsController.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The SessionLogsController manages the Session Logs page, which displays
 * historical session data and provides export functionality. It renders
 * session summaries, statistics, and enables users to download session
 * data as JSON files for external analysis.
 *
 * PAGE LAYOUT:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  TOTAL SESSIONS: [count]                                    │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  LATEST SESSION CARD                                        │
 *   │  ├── Title                                                  │
 *   │  ├── Date and Time                                          │
 *   │  ├── Duration                                               │
 *   │  └── [Export Button]                                        │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  SESSION LIST                                               │
 *   │  ├── Session Card 1                                         │
 *   │  ├── Session Card 2                                         │
 *   │  └── ...                                                    │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * DATA FLOW:
 *
 *   [SessionLogger (localStorage)]
 *        ↓ getSessions()
 *   [SessionLogsController]
 *        ↓ renders
 *   [DOM Elements]
 *
 * VISUAL DESIGN:
 * Session cards use alternating icon styles for visual variety.
 * The ICON_STYLES array defines four visual themes that cycle
 * through the session list, providing visual distinction.
 *
 * EXPORT FUNCTIONALITY:
 * Users can export the latest session as a JSON file containing:
 *   - Session metadata (ID, title, timestamps)
 *   - All logged events with timestamps
 *   - (Future) AI detection records
 *
 * This enables:
 *   - External analysis in data tools
 *   - Long-term archival beyond localStorage limits
 *   - Sharing session data for debugging
 *
 * =============================================================================
 */

import { SessionLogger, type Session } from "../logging/sessionLogger";
import {
  formatDateLabel,
  formatDurationMs,
  formatTimeLabel,
} from "../services/timeService";

/**
 * ICON STYLE DEFINITIONS
 *
 * Visual themes for session cards that cycle through the session list.
 * Each style defines:
 *   - icon: Material Symbols icon name
 *   - glow: CSS class for glow effect
 *   - iconColor: CSS class for icon color
 *   - card: CSS class for card background
 *   - border: CSS class for icon container border
 *
 * DESIGN RATIONALE:
 * Alternating styles provide visual rhythm in long session lists,
 * making it easier to scan and distinguish between sessions.
 * The styles use the application's design system colors.
 *
 * ICON MEANINGS:
 *   - search_check: Represents completed search/monitoring
 *   - emergency: Represents alert or incident
 *   - map: Represents navigation/exploration
 *   - detection_and_zone: Represents AI detection activity
 *
 * In the current implementation, icons are assigned by index (modulo 4)
 * rather than based on session content. Future versions could analyze
 * session events to select appropriate icons.
 */
const ICON_STYLES = [
  {
    icon: "search_check",
    glow: "glow-primary",
    iconColor: "text-primary",
    card: "bg-surface-container-low",
    border: "border-primary/20",
  },
  {
    icon: "emergency",
    glow: "glow-secondary",
    iconColor: "text-secondary",
    card: "bg-surface-container-high/40",
    border: "border-secondary/20",
  },
  {
    icon: "map",
    glow: "glow-primary",
    iconColor: "text-primary",
    card: "bg-surface-container-low",
    border: "border-primary/20",
  },
  {
    icon: "detection_and_zone",
    glow: "glow-secondary",
    iconColor: "text-secondary",
    card: "bg-surface-container-high/40",
    border: "border-secondary/20",
  },
];

/**
 * SESSION LOGS CONTROLLER CLASS
 *
 * Manages the Session Logs page UI and export functionality.
 *
 * This controller is stateless beyond its reference to the SessionLogger.
 * It reads session data and renders it to the DOM, but doesn't maintain
 * any internal state about sessions.
 *
 * DOM REQUIREMENTS:
 * The HTML page must include elements with these data attributes:
 *   - [data-total-sessions]: Displays session count
 *   - [data-latest-title]: Latest session title
 *   - [data-latest-date]: Latest session date
 *   - [data-latest-time]: Latest session time
 *   - [data-latest-duration]: Latest session duration
 *   - [data-latest-range]: Latest session range (placeholder)
 *   - [data-session-list]: Container for session cards
 *   - [data-export-latest]: Export button for latest session
 */
export class SessionLogsController {
  /**
   * CONSTRUCTOR
   *
   * @param logger - SessionLogger instance for accessing session data.
   *                 The logger provides read access to historical sessions
   *                 stored in localStorage.
   */
  constructor(private logger: SessionLogger) {}

  /**
   * INITIALIZE CONTROLLER
   *
   * Renders the session logs page with current data.
   *
   * INITIALIZATION SEQUENCE:
   *
   *   1. LOAD SESSIONS
   *      Retrieve all sessions from the SessionLogger.
   *      Sessions are ordered newest-first.
   *
   *   2. UPDATE TOTAL COUNT
   *      Display the total number of sessions.
   *
   *   3. UPDATE LATEST SESSION CARD
   *      Populate the featured "latest session" section.
   *      Shows placeholder content if no sessions exist.
   *
   *   4. BUILD SESSION LIST
   *      Generate and append cards for all sessions.
   *
   *   5. SETUP EXPORT BUTTON
   *      Attach click handler for JSON export functionality.
   *
   * STATIC RENDERING:
   * The page is rendered once on init(). It doesn't automatically
   * update if new sessions are created. Users must reload the page
   * to see new sessions (acceptable UX for a logs page).
   */
  init(): void {
    /*
     * Load all sessions from storage.
     * Sessions are returned in reverse chronological order
     * (newest first), which matches typical log display.
     */
    const sessions = this.logger.getSessions();

    /*
     * UPDATE TOTAL SESSION COUNT
     *
     * Find the element displaying total count and update it.
     * This gives users a quick overview of their activity.
     */
    const total = document.querySelector<HTMLElement>("[data-total-sessions]");
    if (total) {
      total.textContent = String(sessions.length);
    }

    /*
     * UPDATE LATEST SESSION CARD
     *
     * The latest session gets special treatment with a
     * larger, featured card. If no sessions exist, show
     * placeholder content.
     */
    const latest = sessions[0];
    if (latest) {
      updateLatestSession(latest);
    } else {
      updateLatestEmpty();
    }

    /*
     * BUILD SESSION LIST
     *
     * Clear any existing content and generate fresh cards.
     * Each card shows session summary with title, date/time,
     * and duration.
     */
    const list = document.querySelector<HTMLElement>("[data-session-list]");
    if (list) {
      /*
       * Clear existing content to prevent duplication
       * if init() is called multiple times.
       */
      list.innerHTML = "";

      /*
       * Generate and append a card for each session.
       * The index is passed for icon style rotation.
       */
      sessions.forEach((session, index) => {
        list.appendChild(buildSessionItem(session, index));
      });
    }

    /*
     * SETUP EXPORT BUTTON
     *
     * The export button downloads the latest session as JSON.
     * Disabled if no sessions exist.
     */
    const exportButton = document.querySelector<HTMLButtonElement>(
      "[data-export-latest]",
    );
    if (exportButton) {
      /*
       * Disable the button if there's nothing to export.
       */
      exportButton.disabled = !latest;

      /*
       * EXPORT CLICK HANDLER
       *
       * Creates a JSON blob from the session data and triggers
       * a download using a dynamically created anchor element.
       */
      exportButton.addEventListener("click", () => {
        if (!latest) {
          return;
        }

        /*
         * Get the JSON representation of the session.
         * This includes all events and metadata.
         */
        const json = this.logger.exportSession(latest.id);

        /*
         * Create a Blob (Binary Large Object) from the JSON string.
         * The MIME type tells the browser this is JSON data.
         */
        const blob = new Blob([json], { type: "application/json" });

        /*
         * Create a temporary URL for the blob.
         * This URL can be used as a download link.
         */
        const url = URL.createObjectURL(blob);

        /*
         * Create a hidden anchor element to trigger the download.
         * This is the standard pattern for programmatic downloads.
         */
        const link = document.createElement("a");

        /*
         * Generate a safe filename from the session title.
         * Replace any characters that might cause filesystem issues.
         */
        const safeName = latest.title.replace(/[^a-zA-Z0-9-_]+/g, "_");
        link.href = url;
        link.download = `${safeName}.json`;

        /*
         * Trigger the download by simulating a click.
         */
        link.click();

        /*
         * Clean up the temporary URL to free memory.
         * The blob remains in memory until garbage collected.
         */
        URL.revokeObjectURL(url);
      });
    }
  }
}

/**
 * UPDATE LATEST SESSION DISPLAY
 *
 * Populates the "latest session" card with session data.
 *
 * @param session - The most recent session to display
 *
 * This function updates multiple DOM elements identified by
 * data attributes. Missing elements are silently skipped,
 * allowing flexible page layouts.
 *
 * DISPLAYED INFORMATION:
 *   - Title: Session name/identifier
 *   - Date: Formatted date (e.g., "Today" or "Jan 15, 2025")
 *   - Time: Start time (e.g., "14:30")
 *   - Duration: Formatted duration (e.g., "2h 15m")
 *   - Range: Placeholder for future distance tracking ("--")
 */
function updateLatestSession(session: Session): void {
  /*
   * Find all the display elements by their data attributes.
   */
  const title = document.querySelector<HTMLElement>("[data-latest-title]");
  const date = document.querySelector<HTMLElement>("[data-latest-date]");
  const time = document.querySelector<HTMLElement>("[data-latest-time]");
  const duration = document.querySelector<HTMLElement>(
    "[data-latest-duration]",
  );
  const range = document.querySelector<HTMLElement>("[data-latest-range]");

  /*
   * Update each element if it exists.
   * Use formatting functions for consistent display.
   */
  if (title) {
    title.textContent = session.title;
  }
  if (date) {
    date.textContent = formatDateLabel(new Date(session.startedAt));
  }
  if (time) {
    time.textContent = formatTimeLabel(new Date(session.startedAt));
  }
  if (duration) {
    duration.textContent = formatDurationMs(getSessionDurationMs(session));
  }
  if (range) {
    /*
     * Range/distance tracking is not yet implemented.
     * Display placeholder until future feature addition.
     */
    range.textContent = "--";
  }
}

/**
 * UPDATE LATEST SESSION DISPLAY (EMPTY STATE)
 *
 * Populates the "latest session" card with placeholder content
 * when no sessions exist.
 *
 * This provides visual consistency and guides users to create
 * their first session rather than showing an empty card.
 */
function updateLatestEmpty(): void {
  const title = document.querySelector<HTMLElement>("[data-latest-title]");
  const date = document.querySelector<HTMLElement>("[data-latest-date]");
  const time = document.querySelector<HTMLElement>("[data-latest-time]");
  const duration = document.querySelector<HTMLElement>(
    "[data-latest-duration]",
  );
  const range = document.querySelector<HTMLElement>("[data-latest-range]");

  if (title) {
    title.textContent = "No Sessions Yet";
  }
  if (date) {
    date.textContent = "--";
  }
  if (time) {
    time.textContent = "--";
  }
  if (duration) {
    duration.textContent = "0s";
  }
  if (range) {
    range.textContent = "--";
  }
}

/**
 * CALCULATE SESSION DURATION
 *
 * Computes the duration of a session in milliseconds.
 *
 * @param session - The session to calculate duration for
 * @returns Duration in milliseconds (always non-negative)
 *
 * HANDLING ACTIVE SESSIONS:
 * If the session hasn't ended (endedAt is undefined), we calculate
 * duration up to the current time. This allows displaying duration
 * for the currently active session.
 *
 * EDGE CASES:
 * Returns 0 if the calculated duration would be negative
 * (possible with clock adjustments or data corruption).
 */
function getSessionDurationMs(session: Session): number {
  /*
   * Use endedAt timestamp if available, otherwise current time.
   * This handles both completed and active sessions.
   */
  const end = session.endedAt ?? Date.now();

  /*
   * Calculate duration, ensuring non-negative result.
   */
  return Math.max(0, end - session.startedAt);
}

/**
 * BUILD SESSION LIST ITEM
 *
 * Creates a DOM element representing a single session in the list.
 *
 * @param session - The session data to display
 * @param index - Position in the list (used for style cycling)
 * @returns A fully constructed HTML element ready for insertion
 *
 * ELEMENT STRUCTURE:
 *
 *   <div class="session-card">
 *     <div class="left-content">
 *       <div class="icon-container">
 *         <span class="material-symbols-outlined">icon</span>
 *       </div>
 *       <div class="text-content">
 *         <h4>Session Title</h4>
 *         <div class="metadata">
 *           <span>📅 Jan 15, 2025</span>
 *           <span>🕐 14:30</span>
 *         </div>
 *       </div>
 *     </div>
 *     <div class="right-content">
 *       <div class="duration">
 *         <p>Duration</p>
 *         <p>2h 15m</p>
 *       </div>
 *     </div>
 *   </div>
 *
 * STYLING:
 * Uses Tailwind CSS classes for styling. The ICON_STYLES array
 * provides rotating visual themes based on the session index.
 *
 * HOVER EFFECTS:
 * Cards have hover transitions for improved interactivity.
 * The title changes color on hover for visual feedback.
 */
function buildSessionItem(session: Session, index: number): HTMLElement {
  /*
   * Select style based on index, cycling through available styles.
   * Modulo ensures the index wraps around the array length.
   */
  const style = ICON_STYLES[index % ICON_STYLES.length];

  /*
   * CREATE WRAPPER ELEMENT
   *
   * The main container with card styling, hover effects,
   * and flexbox layout for content alignment.
   */
  const wrapper = document.createElement("div");
  wrapper.className = `${style.card} p-6 rounded-lg flex items-center justify-between hover:bg-surface-container-high transition-all group ${style.glow}`;

  /*
   * CREATE LEFT CONTENT (Icon + Text)
   */
  const left = document.createElement("div");
  left.className = "flex items-center gap-6";

  /*
   * ICON CONTAINER
   *
   * Circular container with border, holding the Material Symbol icon.
   */
  const iconWrap = document.createElement("div");
  iconWrap.className = `w-14 h-14 bg-surface-container-highest rounded-full flex items-center justify-center border ${style.border}`;

  const icon = document.createElement("span");
  icon.className = `material-symbols-outlined ${style.iconColor}`;
  icon.textContent = style.icon;

  /*
   * TEXT CONTENT (Title + Metadata)
   */
  const textBlock = document.createElement("div");

  /*
   * SESSION TITLE
   *
   * Uses group-hover for coordinated hover effect with parent.
   */
  const title = document.createElement("h4");
  title.className =
    "font-bold text-xl group-hover:text-primary transition-colors";
  title.textContent = session.title;

  /*
   * METADATA ROW (Date + Time)
   */
  const meta = document.createElement("div");
  meta.className = "flex gap-4 mt-1";

  /*
   * DATE ELEMENT
   *
   * Shows formatted date with calendar icon.
   */
  const date = document.createElement("span");
  date.className =
    "text-xs font-bold text-on-surface-variant flex items-center gap-1";
  date.innerHTML = `<span class=\"material-symbols-outlined text-[1rem]\" data-icon=\"calendar_today\">calendar_today</span> ${formatDateLabel(new Date(session.startedAt))}`;

  /*
   * TIME ELEMENT
   *
   * Shows formatted time with clock icon.
   */
  const time = document.createElement("span");
  time.className =
    "text-xs font-bold text-on-surface-variant flex items-center gap-1";
  time.innerHTML = `<span class=\"material-symbols-outlined text-[1rem]\" data-icon=\"schedule\">schedule</span> ${formatTimeLabel(new Date(session.startedAt))}`;

  /*
   * ASSEMBLE LEFT CONTENT
   */
  meta.appendChild(date);
  meta.appendChild(time);
  textBlock.appendChild(title);
  textBlock.appendChild(meta);
  iconWrap.appendChild(icon);
  left.appendChild(iconWrap);
  left.appendChild(textBlock);

  /*
   * CREATE RIGHT CONTENT (Duration)
   */
  const right = document.createElement("div");
  right.className = "flex items-center gap-8";

  /*
   * DURATION BLOCK
   *
   * Hidden on small screens (sm:block) for responsive design.
   */
  const durationBlock = document.createElement("div");
  durationBlock.className = "text-right hidden sm:block";

  const durationLabel = document.createElement("p");
  durationLabel.className =
    "text-[0.6rem] font-bold text-on-surface-variant uppercase tracking-widest";
  durationLabel.textContent = "Duration";

  const durationValue = document.createElement("p");
  durationValue.className = "text-lg font-black";
  durationValue.textContent = formatDurationMs(getSessionDurationMs(session));

  /*
   * ASSEMBLE RIGHT CONTENT
   */
  durationBlock.appendChild(durationLabel);
  durationBlock.appendChild(durationValue);
  right.appendChild(durationBlock);

  /*
   * ASSEMBLE COMPLETE CARD
   */
  wrapper.appendChild(left);
  wrapper.appendChild(right);

  return wrapper;
}
