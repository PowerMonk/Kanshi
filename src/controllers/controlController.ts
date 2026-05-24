/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - CONTROL CONTROLLER
 * =============================================================================
 *
 * File: src/controllers/controlController.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The ControlController serves as the central coordinator for robot movement
 * commands. It acts as the bridge between the input layer (InputController)
 * and the network communication layer (RobotControlService), orchestrating
 * the flow of commands from user actions to physical motor control.
 *
 * ARCHITECTURAL ROLE:
 * In the Kanshi command pipeline, the ControlController sits at a critical
 * junction point:
 *
 *   [InputController]              [ConfigStore]
 *         ↓                              ↓
 *   "control:command"           "config:changed"
 *         ↓                              ↓
 *         └───────────┬─────────────────┘
 *                     ↓
 *            [ControlController]
 *                     ↓
 *           [RobotControlService]
 *                     ↓
 *             [HTTP to Pi]
 *
 * RESPONSIBILITIES:
 *   1. Subscribe to control:command events from InputController
 *   2. Forward commands to RobotControlService for network transmission
 *   3. React to configuration changes (speed adjustments)
 *   4. Initialize service state from persisted configuration
 *
 * SEPARATION OF CONCERNS:
 * The ControlController deliberately does NOT:
 *   - Parse keyboard/UI input (that's InputController's job)
 *   - Manage HTTP communication (that's RobotControlService's job)
 *   - Persist configuration (that's ConfigStore's job)
 *
 * This separation enables:
 *   - Independent testing of each component
 *   - Easy substitution of input methods or network protocols
 *   - Clear debugging boundaries
 *
 * FIRE-AND-FORGET PATTERN:
 * Commands are sent asynchronously using `void` to explicitly discard
 * the Promise return value. This indicates intentional fire-and-forget
 * behavior where command results are communicated via events, not
 * direct return values.
 *
 * =============================================================================
 */

import type { AppEvents } from "../config/types";
import type { EventBus } from "../services/eventBus";
import { ConfigStore } from "../config/configStore";
import { RobotControlService } from "../services/robotControlService";

/**
 * CONTROL CONTROLLER CLASS
 *
 * Coordinates robot control commands between input and network layers.
 *
 * This controller follows the mediator pattern, acting as a central hub
 * that coordinates interactions between components without them needing
 * to know about each other directly.
 *
 * DEPENDENCY GRAPH:
 *   ControlController
 *       ├── EventBus (for receiving commands and config changes)
 *       ├── RobotControlService (for sending commands to Pi)
 *       └── ConfigStore (for reading initial configuration)
 *
 * LIFECYCLE:
 *   1. Instantiate with all dependencies
 *   2. Call init() to set up event subscriptions
 *   3. Controller runs for page lifetime
 *
 * REACTIVE CONFIGURATION:
 * The controller subscribes to config:changed events, ensuring that
 * speed changes made in the UI are immediately reflected in subsequent
 * commands without requiring application restart.
 */
export class ControlController {
  /**
   * CONSTRUCTOR
   *
   * Initializes the ControlController with required dependencies.
   *
   * @param bus - EventBus for subscribing to control commands and
   *              configuration change events. This is the primary
   *              communication channel in the application.
   *
   * @param robotService - RobotControlService instance for sending
   *                       commands to the Raspberry Pi. The controller
   *                       delegates all network communication to this service.
   *
   * @param configStore - ConfigStore for reading initial configuration.
   *                      The controller uses this to set the initial
   *                      speed value before any commands are sent.
   *
   * DEPENDENCY INJECTION:
   * All dependencies are injected through the constructor, enabling:
   *   - Easy testing with mock implementations
   *   - Clear visibility of dependencies
   *   - Flexible composition in different contexts
   */
  constructor(
    private bus: EventBus<AppEvents>,
    private robotService: RobotControlService,
    private configStore: ConfigStore,
  ) {}

  /**
   * INITIALIZE CONTROLLER
   *
   * Sets up event subscriptions and initializes service state.
   * This method should be called once during application startup,
   * after all dependencies are properly instantiated.
   *
   * INITIALIZATION SEQUENCE:
   *
   *   1. READ INITIAL CONFIGURATION
   *      Load the persisted configuration from storage and apply
   *      the speed setting to the robot service. This ensures the
   *      first commands use the user's preferred speed.
   *
   *   2. SUBSCRIBE TO CONTROL COMMANDS
   *      Listen for control:command events from the InputController.
   *      When received, forward the command to the robot service
   *      for network transmission.
   *
   *   3. SUBSCRIBE TO CONFIGURATION CHANGES
   *      Listen for config:changed events from the ConfigStore.
   *      When the user adjusts speed in the UI, update the robot
   *      service's speed setting.
   *
   * EVENT FLOW EXAMPLE:
   *
   *   User presses W key
   *        ↓
   *   InputController emits control:command { command: "forward", source: "keyboard" }
   *        ↓
   *   ControlController receives event
   *        ↓
   *   ControlController calls robotService.sendCommand("forward")
   *        ↓
   *   RobotControlService sends HTTP GET to Pi
   *        ↓
   *   Pi moves motors forward
   */
  init(): void {
    /*
     * LOAD INITIAL CONFIGURATION
     *
     * Retrieve the persisted configuration and apply the speed setting.
     * This ensures consistency with user preferences from previous sessions.
     *
     * The config may contain:
     *   - control.speedPercent: 0-100 motor speed percentage
     *   - ai.*: AI detection settings (not used by this controller)
     */
    const config = this.configStore.getConfig();
    this.robotService.setSpeedPercent(config.control.speedPercent);

    /*
     * SUBSCRIBE TO CONTROL COMMANDS
     *
     * Listen for all control:command events, regardless of source.
     * The InputController emits these for keyboard and UI input.
     *
     * The event payload contains:
     *   - command: RobotCommand ("forward", "backward", "left", "right", "stop")
     *   - source: ControlSource ("keyboard", "ui", "system")
     *
     * We only use the command here; source is logged by SessionController.
     *
     * FIRE-AND-FORGET:
     * Using `void` explicitly discards the Promise return value.
     * This communicates that we're intentionally not awaiting the result.
     * Command success/failure is communicated via control:sent events.
     */
    this.bus.on("control:command", ({ command }) => {
      void this.robotService.sendCommand(command);
    });

    /*
     * SUBSCRIBE TO CONFIGURATION CHANGES
     *
     * React to configuration updates from the ConfigStore.
     * This enables real-time speed adjustment without page reload.
     *
     * When the user changes speed in the AI Configuration page or
     * any other settings UI, the ConfigStore emits config:changed.
     * We respond by updating the robot service's speed setting.
     *
     * The updated speed takes effect on the next command sent.
     * Commands already in flight use the previous speed value.
     *
     * NOTE: The current Raspberry Pi server ignores speed parameters
     * and uses a fixed 85% speed. This code prepares for future
     * variable speed support without requiring client-side changes.
     */
    this.bus.on("config:changed", ({ config: updated }) => {
      this.robotService.setSpeedPercent(updated.control.speedPercent);
    });
  }
}
