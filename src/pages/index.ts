/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - MAIN DASHBOARD ENTRY POINT
 * =============================================================================
 *
 * File: src/pages/index.ts
 * Execution Context: Desktop PC (Browser Environment)
 * HTML Target: index.html (Main Dashboard)
 *
 * PURPOSE:
 * This is the primary application entry point for the Kanshi main dashboard.
 * It orchestrates the initialization of all system components required for
 * real-time robot control and monitoring. This file is the "composition root"
 * where dependency injection occurs and the application comes to life.
 *
 * PAGE FUNCTION:
 * The main dashboard provides:
 *   - Live video feed from the Raspberry Pi camera
 *   - Real-time robot control via WASD keys and UI buttons
 *   - Status HUD showing robot state, latency, and stream status
 *   - Session recording controls
 *
 * COMPONENT INITIALIZATION ORDER:
 * The initialization follows a specific sequence to ensure dependencies
 * are available when needed:
 *
 *   1. CORE SERVICES
 *      EventBus → StorageService → ConfigStore → RobotControlService
 *      These foundational services must exist before controllers.
 *
 *   2. CONTROL LAYER
 *      ControlController → InputController → SessionController
 *      These connect user input to robot commands and logging.
 *
 *   3. VIDEO LAYER
 *      StreamController (conditionally if stream element exists)
 *
 *   4. UI LAYER
 *      StatusHud (displays real-time status information)
 *
 * DEPENDENCY INJECTION:
 * All dependencies are created here and passed to constructors.
 * This pattern provides:
 *   - Clear visibility of dependencies
 *   - Easy testing through mock injection
 *   - Single point for composition changes
 *
 * EVENT FLOW AFTER INITIALIZATION:
 *
 *   [User Action]
 *        ↓
 *   [InputController] → control:command
 *        ↓
 *   [ControlController] → [RobotControlService] → HTTP to Pi
 *        ↓
 *   control:sent
 *        ↓
 *   [StatusHud] + [SessionLogger]
 *
 * =============================================================================
 */

import { STREAM_URL } from "../config/constants";
import type { AppEvents } from "../config/types";
import { ConfigStore } from "../config/configStore";
import { ControlController } from "../controllers/controlController";
import { InputController } from "../controllers/inputController";
import { SessionController } from "../controllers/sessionController";
import { StreamController } from "../controllers/streamController";
import { SessionLogger } from "../logging/sessionLogger";
import { EventBus } from "../services/eventBus";
import { RobotControlService } from "../services/robotControlService";
import { StorageService } from "../services/storageService";
import { StatusHud } from "../ui/statusHud";

/*
 * =============================================================================
 * PHASE 1: CORE SERVICE INITIALIZATION
 * =============================================================================
 *
 * Create the foundational services that other components depend on.
 * These services are stateful and persist for the page lifetime.
 */

/**
 * EVENT BUS
 *
 * The central communication channel for the application.
 * All components publish and subscribe to events through this bus.
 *
 * The generic type parameter AppEvents ensures type-safe event handling,
 * preventing typos in event names and ensuring payload types match.
 */
const bus = new EventBus<AppEvents>();

/**
 * STORAGE SERVICE
 *
 * Provides localStorage access for persistent data.
 * Used by ConfigStore for settings and SessionLogger for session data.
 *
 * Uses browser localStorage by default (persistent across sessions).
 */
const storage = new StorageService();

/**
 * CONFIGURATION STORE
 *
 * Manages application settings with persistence and change notification.
 * Loaded from localStorage on startup, persisted on changes.
 *
 * The EventBus reference enables config:changed events when settings change.
 */
const configStore = new ConfigStore(storage, bus);

/**
 * ROBOT CONTROL SERVICE
 *
 * Handles HTTP communication with the Raspberry Pi motor controller.
 * Receives the EventBus to emit control:sent events with latency data.
 */
const robotService = new RobotControlService(bus);

/*
 * =============================================================================
 * PHASE 2: CONTROLLER INITIALIZATION
 * =============================================================================
 *
 * Controllers coordinate between services and UI.
 * Each controller is instantiated and immediately initialized.
 */

/**
 * CONTROL CONTROLLER
 *
 * Bridges input events to the robot control service.
 * Subscribes to control:command events and forwards to robotService.
 * Also reacts to config:changed for speed updates.
 */
new ControlController(bus, robotService, configStore).init();

/**
 * INPUT CONTROLLER
 *
 * Captures user input from keyboard (WASD) and UI buttons.
 * Emits control:command events for each movement action.
 * Handles safety stops on blur and visibility changes.
 */
new InputController(bus).init();

/**
 * SESSION CONTROLLER
 *
 * Manages session lifecycle and event logging.
 * Creates a SessionLogger for persistent session storage.
 * Subscribes to control and stream events for logging.
 */
new SessionController(bus, new SessionLogger(storage)).init();

/*
 * =============================================================================
 * PHASE 3: VIDEO STREAM INITIALIZATION
 * =============================================================================
 *
 * Initialize the video stream if the display element exists.
 * This conditional initialization allows pages without video
 * to use the same component structure.
 */

/**
 * STREAM IMAGE ELEMENT
 *
 * Find the <img> element designated for video stream display.
 * Uses data-stream-image attribute for identification.
 *
 * The element may have a data-stream-url attribute to override
 * the default STREAM_URL (useful for testing with different sources).
 */
const streamImage = document.querySelector<HTMLImageElement>(
  "[data-stream-image]",
);

/**
 * CONDITIONAL STREAM CONTROLLER INIT
 *
 * Only initialize the stream if the image element exists.
 * This allows the same codebase to work on pages with or
 * without video display.
 *
 * Stream URL resolution:
 *   1. Check data-stream-url attribute on the element
 *   2. Fall back to STREAM_URL constant from config
 */
if (streamImage) {
  const streamUrl = streamImage.dataset.streamUrl ?? STREAM_URL;
  new StreamController(bus).init(streamImage, streamUrl);
}

/*
 * =============================================================================
 * PHASE 4: UI INITIALIZATION
 * =============================================================================
 *
 * Initialize UI components that display system state.
 */

/**
 * STATUS HUD
 *
 * Displays real-time status information:
 *   - Robot movement state (FORWARD, IDLE, etc.)
 *   - Network latency to Raspberry Pi
 *   - Video stream connection status
 *
 * Element resolution uses querySelector to allow graceful handling
 * of missing elements (partial HUD display is acceptable).
 *
 * Data attributes used:
 *   - [data-bot-status]: Robot movement state display
 *   - [data-latency]: Network latency display
 *   - [data-stream-status]: Stream connection status display
 */
new StatusHud(bus, {
  status: document.querySelector<HTMLElement>("[data-bot-status]"),
  latency: document.querySelector<HTMLElement>("[data-latency]"),
  stream: document.querySelector<HTMLElement>("[data-stream-status]"),
}).init();
