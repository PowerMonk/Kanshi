/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - TIME SERVICE
 * =============================================================================
 *
 * File: src/services/timeService.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The Time Service provides utility functions for formatting temporal data
 * in human-readable formats. These functions are used throughout the Kanshi
 * UI to display durations, dates, and times in a consistent, user-friendly
 * manner.
 *
 * DESIGN PHILOSOPHY:
 * Rather than displaying raw timestamps or ISO strings, Kanshi presents
 * time information in natural language formats:
 *   - "2h 15m" instead of "8100000ms"
 *   - "Today" instead of "2025-01-15"
 *   - "14:30" instead of "14:30:45.123"
 *
 * This improves user experience by reducing cognitive load when reviewing
 * session logs and status displays.
 *
 * LOCALIZATION:
 * The functions use the browser's Intl API for locale-aware formatting.
 * Date and time displays adapt to the user's system locale settings,
 * showing formats familiar to users worldwide.
 *
 * PURE FUNCTIONS:
 * All functions in this module are pure (no side effects) and stateless.
 * Given the same input, they always produce the same output. This makes
 * them easy to test and reason about.
 *
 * =============================================================================
 */

/**
 * FORMAT DURATION IN MILLISECONDS
 *
 * Converts a duration in milliseconds to a human-readable string showing
 * the most significant time units.
 *
 * The function intelligently selects which units to display based on the
 * duration magnitude:
 *   - Under 1 minute: shows seconds only ("45s")
 *   - Under 1 hour: shows minutes and seconds ("12m 30s")
 *   - 1 hour or more: shows hours and minutes ("2h 15m")
 *
 * This tiered approach ensures the output is always concise while
 * conveying appropriate precision for the timescale involved.
 *
 * @param durationMs - Duration in milliseconds. Negative values are
 *                     treated as zero (clamped to minimum 0 seconds).
 *
 * @returns Formatted duration string in the pattern "Xh Ym", "Xm Ys", or "Xs"
 *
 * USE CASES:
 *   - Session duration in the session logs list
 *   - Elapsed time displays during active sessions
 *   - Historical session statistics
 *
 * EXAMPLES:
 *   formatDurationMs(0)        → "0s"
 *   formatDurationMs(5000)     → "5s"
 *   formatDurationMs(65000)    → "1m 5s"
 *   formatDurationMs(3723000)  → "1h 2m"
 *   formatDurationMs(-1000)    → "0s" (negative clamped to 0)
 *
 * DESIGN NOTES:
 *   - Seconds are not shown when hours are present to keep output concise
 *   - Leading zeros are not used (5s not 05s) for natural appearance
 *   - Spaces separate units for readability
 */
export function formatDurationMs(durationMs: number): string {
  /*
   * Convert milliseconds to whole seconds, ensuring non-negative result.
   * Math.floor truncates fractional seconds (we don't need sub-second precision).
   * Math.max(0, ...) handles negative input gracefully.
   */
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));

  /*
   * Decompose total seconds into hours, minutes, and seconds components.
   *
   * Integer division and modulo operations:
   *   - hours: how many complete 3600-second blocks
   *   - minutes: how many complete 60-second blocks in the remainder
   *   - seconds: remaining seconds after extracting hours and minutes
   */
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  /*
   * TIERED OUTPUT FORMAT
   *
   * Select format based on duration magnitude:
   *
   * 1 hour or more: Show hours and minutes only
   *    - Seconds precision is unnecessary for long durations
   *    - Example: 1h 2m (not 1h 2m 30s)
   *
   * Under 1 hour but at least 1 minute: Show minutes and seconds
   *    - Both units provide useful precision
   *    - Example: 12m 30s
   *
   * Under 1 minute: Show seconds only
   *    - Minutes would always be 0, adding no information
   *    - Example: 45s
   */
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * FORMAT DATE LABEL
 *
 * Formats a Date object into a user-friendly date label, with special
 * handling for "today" to make recent dates immediately recognizable.
 *
 * Output formats:
 *   - Today's date → "Today"
 *   - Other dates → "Jan 15, 2025" (locale-dependent)
 *
 * The "Today" special case reduces cognitive load when reviewing recent
 * sessions, as users immediately understand the temporal context without
 * mentally parsing a date string.
 *
 * @param date - JavaScript Date object to format
 *
 * @returns Either "Today" or a locale-formatted date string
 *
 * LOCALE HANDLING:
 * The date formatting uses the browser's default locale (passed as undefined
 * to toLocaleDateString). This means users see dates in their familiar format:
 *   - US: "Jan 15, 2025"
 *   - UK: "15 Jan 2025"
 *   - Germany: "15. Jan. 2025"
 *
 * USE CASES:
 *   - Session logs list headers (grouping sessions by date)
 *   - Session detail views (showing when a session occurred)
 *
 * EXAMPLES:
 *   formatDateLabel(new Date())           → "Today"
 *   formatDateLabel(new Date("2025-01-15")) → "Jan 15, 2025" (in en-US)
 *
 * TIMEZONE CONSIDERATION:
 * Both the input Date and the "today" comparison use the browser's local
 * timezone. This ensures consistent behavior regardless of when sessions
 * were created relative to midnight UTC.
 */
export function formatDateLabel(date: Date): string {
  /*
   * Create a Date object for the current day.
   * Used to determine if the input date is "today."
   */
  const today = new Date();

  /*
   * Compare date strings to determine if same calendar day.
   * toDateString() returns format like "Wed Jan 15 2025", which
   * includes year, month, and day but not time - perfect for
   * calendar day comparison.
   */
  const sameDay = date.toDateString() === today.toDateString();

  /*
   * Return "Today" for improved UX when viewing recent sessions.
   * Users immediately understand without parsing a date string.
   */
  if (sameDay) {
    return "Today";
  }

  /*
   * Format other dates using the Intl API for locale awareness.
   *
   * Options explained:
   *   - undefined (first param): use browser's default locale
   *   - month: "short" → "Jan" instead of "January" (concise)
   *   - day: "2-digit" → "01" to "31" (consistent width)
   *   - year: "numeric" → "2025" (full year for clarity)
   *
   * This produces output like "Jan 15, 2025" in en-US locale.
   */
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

/**
 * FORMAT TIME LABEL
 *
 * Formats a Date object into a time-only string (hours and minutes).
 *
 * Output format is locale-dependent:
 *   - 24-hour locales: "14:30"
 *   - 12-hour locales: "2:30 PM"
 *
 * Seconds are omitted for cleaner display; minute precision is sufficient
 * for session timestamps and event logs.
 *
 * @param date - JavaScript Date object to format
 *
 * @returns Locale-formatted time string (hours and minutes only)
 *
 * LOCALE HANDLING:
 * Like formatDateLabel, this uses the browser's default locale for
 * familiar time format presentation. Users see times in the format
 * they're accustomed to based on their system settings.
 *
 * USE CASES:
 *   - Session start/end times in session logs
 *   - Event timestamps in session detail views
 *   - Real-time clock displays (if implemented)
 *
 * EXAMPLES:
 *   formatTimeLabel(new Date("2025-01-15T14:30:45"))
 *     → "14:30" (en-GB)
 *     → "2:30 PM" (en-US)
 *
 * PRECISION:
 * Only hours and minutes are shown. Seconds are omitted because:
 *   - Session timestamps don't need second precision
 *   - Cleaner, less cluttered display
 *   - Matches typical clock UX patterns
 */
export function formatTimeLabel(date: Date): string {
  /*
   * Format the time portion of the date using the Intl API.
   *
   * Options explained:
   *   - undefined (first param): use browser's default locale
   *   - hour: "2-digit" → "02" to "23" or "01" to "12" (locale-dependent)
   *   - minute: "2-digit" → "00" to "59" (consistent width)
   *
   * The locale determines 12-hour vs 24-hour format automatically.
   * No need to explicitly specify am/pm handling.
   */
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
