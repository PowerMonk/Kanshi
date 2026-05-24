/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - AI CONFIGURATION PAGE ENTRY POINT
 * =============================================================================
 *
 * File: src/pages/AIconfig.ts
 * Execution Context: Desktop PC (Browser Environment)
 * HTML Target: AIconfig.html (AI Configuration Page)
 *
 * PURPOSE:
 * This entry point initializes the AI Configuration page, which allows users
 * to customize settings for the YOLO-based computer vision pipeline and motor
 * control parameters. It provides a settings interface separate from the main
 * control dashboard.
 *
 * PAGE FUNCTION:
 * The AI Configuration page provides:
 *   - Toggle switches for AI detection features (person, object detection)
 *   - Sliders for confidence threshold and temperature
 *   - Motor speed control slider
 *   - Session recording controls
 *
 * UI ELEMENTS BOUND:
 *
 *   TOGGLE INPUTS (data-config-toggle):
 *   ┌──────────────────────────────────────────┐
 *   │ Person Detection    ☑ Active             │
 *   │ Object Detection    ☐ Inactive           │
 *   └──────────────────────────────────────────┘
 *
 *   RANGE INPUTS (data-config-range):
 *   ┌──────────────────────────────────────────┐
 *   │ Confidence Threshold    ────●──── 65%    │
 *   │ Temperature             ────●──── 50%    │
 *   │ Motor Speed             ────●──── 85%    │
 *   └──────────────────────────────────────────┘
 *
 * COMPONENT ARCHITECTURE:
 * This page uses fewer components than the main dashboard since it focuses
 * on configuration rather than real-time control:
 *
 *   [Entry Point: AIconfig.ts]
 *        ↓
 *   ┌─────────────────────┐
 *   │ Core Services       │
 *   ├─────────────────────┤
 *   │ EventBus            │ ← Event communication
 *   │ StorageService      │ ← localStorage access
 *   │ ConfigStore         │ ← Settings persistence
 *   └─────────────────────┘
 *        ↓
 *   ┌─────────────────────┐
 *   │ Controllers         │
 *   ├─────────────────────┤
 *   │ AiConfigController  │ ← Form binding to config
 *   │ SessionController   │ ← Session start/stop
 *   └─────────────────────┘
 *
 * DATA PERSISTENCE:
 * All configuration changes are immediately persisted to localStorage.
 * When users return to the main dashboard, the new settings are
 * automatically loaded and applied.
 *
 * CROSS-PAGE COMMUNICATION:
 * Configuration changes emit config:changed events through the EventBus.
 * While these events don't cross page boundaries, they enable reactive
 * updates within the configuration page itself.
 *
 * =============================================================================
 */

import type { AppEvents } from "../config/types";
import { AiConfigController } from "../controllers/aiConfigController";
import { SessionController } from "../controllers/sessionController";
import { ConfigStore } from "../config/configStore";
import { SessionLogger } from "../logging/sessionLogger";
import { EventBus } from "../services/eventBus";
import { StorageService } from "../services/storageService";

/*
 * =============================================================================
 * CORE SERVICE INITIALIZATION
 * =============================================================================
 *
 * Initialize the foundational services needed for configuration management.
 * Compared to index.ts, this page doesn't need robot control or stream services.
 */

/**
 * EVENT BUS
 *
 * Creates the event communication channel for this page.
 * Used primarily for config:changed events when settings are modified.
 *
 * Note: Each page gets its own EventBus instance. Events don't
 * automatically propagate between pages. Cross-page state is
 * synchronized through localStorage via ConfigStore.
 */
const bus = new EventBus<AppEvents>();

/**
 * STORAGE SERVICE
 *
 * Provides localStorage access for persistent configuration and sessions.
 * This is the same storage backend used by all Kanshi pages, enabling
 * configuration to persist across page navigation.
 */
const storage = new StorageService();

/**
 * CONFIGURATION STORE
 *
 * Manages application settings with automatic persistence.
 *
 * When users adjust sliders or toggles:
 *   1. AiConfigController updates ConfigStore
 *   2. ConfigStore persists to localStorage
 *   3. ConfigStore emits config:changed event
 *
 * When users navigate to main dashboard:
 *   1. index.ts creates new ConfigStore
 *   2. ConfigStore loads persisted values
 *   3. Robot service uses updated settings
 */
const configStore = new ConfigStore(storage, bus);

/*
 * =============================================================================
 * CONTROLLER INITIALIZATION
 * =============================================================================
 *
 * Initialize the controllers that manage this page's functionality.
 */

/**
 * AI CONFIGURATION CONTROLLER
 *
 * Binds UI form elements to the configuration store:
 *
 *   - Finds all elements with data-config-toggle attribute
 *   - Finds all elements with data-config-range attribute
 *   - Sets initial values from stored configuration
 *   - Attaches event listeners for user changes
 *   - Updates ConfigStore when values change
 *
 * SUPPORTED CONFIGURATION KEYS:
 *   ai.personDetection   - Boolean toggle
 *   ai.objectDetection   - Boolean toggle
 *   ai.confidence        - Number range (0-100)
 *   ai.temperature       - Number range (0-100)
 *   control.speedPercent - Number range (0-100)
 */
new AiConfigController(configStore).init();

/**
 * SESSION CONTROLLER
 *
 * Provides session management on the configuration page.
 *
 * While users typically manage sessions from the main dashboard,
 * having session controls here allows starting/stopping sessions
 * without navigating away from settings.
 *
 * The SessionController:
 *   - Manages session toggle buttons (data-session-toggle)
 *   - Updates button text based on session state
 *   - Logs events to the current session (if active)
 *
 * Note: On this page, there are fewer events to log compared to
 * the main dashboard (no control commands or stream events).
 */
new SessionController(bus, new SessionLogger(storage)).init();
