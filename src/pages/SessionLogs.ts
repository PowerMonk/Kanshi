/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - SESSION LOGS PAGE ENTRY POINT
 * =============================================================================
 *
 * File: src/pages/SessionLogs.ts
 * Execution Context: Desktop PC (Browser Environment)
 * HTML Target: SessionLogs.html (Session History Page)
 *
 * PURPOSE:
 * This entry point initializes the Session Logs page, which provides a
 * historical view of all recorded sessions. It enables users to review
 * past robot operations and export session data for external analysis.
 *
 * PAGE FUNCTION:
 * The Session Logs page provides:
 *   - Total session count statistic
 *   - Featured card for the most recent session
 *   - Scrollable list of all past sessions
 *   - Export functionality for session data (JSON)
 *
 * PAGE LAYOUT:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │                    TOTAL SESSIONS: 12                           │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │  ┌─────────────────────────────────────────────────────────┐   │
 *   │  │  LATEST SESSION                                         │   │
 *   │  │  ─────────────────────────────────────────────────────  │   │
 *   │  │  Session #12: Patrol Run                                │   │
 *   │  │  Today • 14:30 • 2h 15m                                 │   │
 *   │  │                                    [Export JSON]         │   │
 *   │  └─────────────────────────────────────────────────────────┘   │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │  SESSION HISTORY                                                │
 *   │  ┌──────────────────────────────────────────────────────────┐  │
 *   │  │ 🔍 Session #12   Today, 14:30            Duration: 2h 15m│  │
 *   │  ├──────────────────────────────────────────────────────────┤  │
 *   │  │ ⚠️ Session #11   Jan 14, 09:15           Duration: 45m  │  │
 *   │  ├──────────────────────────────────────────────────────────┤  │
 *   │  │ 🗺️ Session #10   Jan 14, 08:00           Duration: 1h 30m│  │
 *   │  └──────────────────────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * MINIMAL DEPENDENCIES:
 * This page is a read-only display of historical data. It doesn't need:
 *   - EventBus (no events to publish or subscribe)
 *   - ConfigStore (no configuration changes)
 *   - ControlController (no robot control)
 *
 * Only StorageService and SessionLogger are required to read session data.
 *
 * DATA FLOW:
 *
 *   [localStorage]
 *        ↓ StorageService.getJSON()
 *   [SessionLogger.getSessions()]
 *        ↓
 *   [SessionLogsController.init()]
 *        ↓ renders
 *   [DOM Elements]
 *
 * EXPORT FUNCTIONALITY:
 * Users can export session data as JSON files:
 *   1. Click "Export" button on latest session
 *   2. SessionLogger.exportSession() generates JSON
 *   3. Browser triggers file download
 *   4. User saves file locally
 *
 * This enables:
 *   - Data archival beyond localStorage limits
 *   - Analysis in external tools (Python, Excel)
 *   - Sharing sessions for debugging support
 *
 * =============================================================================
 */

import { SessionLogsController } from "../controllers/sessionLogsController";
import { SessionLogger } from "../logging/sessionLogger";
import { StorageService } from "../services/storageService";

/*
 * =============================================================================
 * SERVICE INITIALIZATION
 * =============================================================================
 *
 * This page requires minimal services since it's read-only.
 * No EventBus or ConfigStore needed.
 */

/**
 * STORAGE SERVICE
 *
 * Provides access to localStorage where session data is persisted.
 * The SessionLogger uses this to read historical sessions.
 *
 * Session data is stored under the "kanshi.sessions" key as a
 * JSON array of session objects.
 */
const storage = new StorageService();

/*
 * =============================================================================
 * CONTROLLER INITIALIZATION
 * =============================================================================
 *
 * Single controller manages the entire page.
 */

/**
 * SESSION LOGS CONTROLLER
 *
 * Reads session history and renders it to the page.
 *
 * The controller performs these operations:
 *
 *   1. LOAD SESSIONS
 *      SessionLogger.getSessions() retrieves all stored sessions
 *      in reverse chronological order (newest first).
 *
 *   2. UPDATE STATISTICS
 *      Displays total session count in the header.
 *
 *   3. RENDER LATEST SESSION
 *      Populates the featured "latest session" card with:
 *      - Session title
 *      - Date and time
 *      - Duration
 *      - Export button
 *
 *   4. BUILD SESSION LIST
 *      Dynamically generates session cards for all sessions.
 *      Cards alternate visual styles for visual variety.
 *
 *   5. SETUP EXPORT
 *      Attaches click handler to export button for JSON download.
 *
 * STATIC RENDERING:
 * The page content is rendered once on initialization.
 * If sessions are added/modified after page load (rare scenario),
 * a refresh is required to see updates. This is acceptable for
 * a historical data view.
 *
 * EMPTY STATE:
 * When no sessions exist:
 *   - Latest session card shows "No Sessions Yet"
 *   - Session list is empty
 *   - Export button is disabled
 */
new SessionLogsController(new SessionLogger(storage)).init();
