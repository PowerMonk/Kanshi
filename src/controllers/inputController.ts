/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - INPUT CONTROLLER
 * =============================================================================
 *
 * File: src/controllers/inputController.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The InputController serves as the primary human-machine interface for robot
 * control. It captures user input from multiple sources (keyboard and UI buttons)
 * and translates them into standardized control commands that flow through the
 * event system to the robot hardware.
 *
 * INPUT SOURCES:
 *
 *   1. KEYBOARD INPUT (WASD Pattern)
 *      - W: Forward
 *      - A: Left (turn)
 *      - S: Backward
 *      - D: Right (turn)
 *
 *   2. UI BUTTON INPUT
 *      - On-screen buttons with data-command attributes
 *      - Touch-compatible for mobile/tablet operation
 *
 * COMMAND FLOW:
 *
 *   [Keyboard/Button Input]
 *        ↓
 *   [InputController]
 *        ↓ emit("control:command")
 *   [EventBus]
 *        ↓
 *   [ControlController]
 *        ↓
 *   [RobotControlService]
 *        ↓
 *   [Raspberry Pi Motors]
 *
 * KEY HANDLING COMPLEXITY:
 * The InputController implements sophisticated key state tracking to handle
 * multi-key scenarios gracefully:
 *
 *   Scenario: User presses W (forward), then A (left), then releases W
 *   Expected: Robot should now turn left (not stop)
 *
 *   Scenario: User presses W and A simultaneously, then releases both
 *   Expected: Robot should stop when all keys are released
 *
 * This is achieved through:
 *   - activeKeys: Set of currently pressed control keys
 *   - keyOrder: Array tracking the order keys were pressed
 *   - lastCommand: The most recently emitted command
 *
 * SAFETY FEATURES:
 *   - Automatic stop when window loses focus (blur event)
 *   - Automatic stop when tab becomes hidden (Page Visibility API)
 *   - Text input detection to prevent accidental commands while typing
 *
 * =============================================================================
 */

import type { AppEvents, ControlSource, RobotCommand } from "../config/types";
import type { EventBus } from "../services/eventBus";

/**
 * KEY TO COMMAND MAPPING
 *
 * Maps keyboard key names to their corresponding robot commands.
 * Uses the industry-standard WASD layout familiar to gamers and
 * remote control operators.
 *
 * WASD RATIONALE:
 * - W: "Up" on keyboard, intuitively maps to forward
 * - A: Left of W, maps to left turn
 * - S: Below W (opposite), maps to backward
 * - D: Right of W, maps to right turn
 *
 * Keys are stored lowercase to normalize event.key values.
 */
const KEY_COMMAND_MAP: Record<string, RobotCommand> = {
  w: "forward",
  a: "left",
  s: "backward",
  d: "right",
};

/**
 * INPUT CONTROLLER CLASS
 *
 * Manages user input capture and translation to robot commands.
 *
 * This controller follows the "controller" pattern from MVC architecture:
 * it coordinates between user input (view events) and application state
 * (model/services) without containing business logic itself.
 *
 * LIFECYCLE:
 *   1. Instantiate with EventBus reference
 *   2. Call init() to attach event listeners
 *   3. InputController runs for page lifetime (no explicit cleanup needed)
 *
 * STATE MANAGEMENT:
 * The controller maintains state about currently pressed keys to support
 * complex input scenarios where multiple keys are held simultaneously.
 * This state is internal and not persisted across page loads.
 *
 * EVENT EMISSION:
 * All input, regardless of source, is normalized to "control:command" events.
 * This decouples input handling from command execution, allowing the
 * ControlController to handle commands uniformly.
 */
export class InputController {
  /**
   * ACTIVE KEYS SET
   *
   * Tracks which control keys are currently pressed.
   * Used to detect when all keys are released (trigger stop)
   * and to prevent duplicate keydown handling.
   *
   * Only contains keys that map to commands (W, A, S, D).
   */
  private activeKeys = new Set<string>();

  /**
   * KEY PRESS ORDER ARRAY
   *
   * Maintains the order in which keys were pressed.
   * When a key is released, this allows us to determine which
   * command should be active (the most recently pressed key
   * that is still held).
   *
   * Example sequence:
   *   Press W → keyOrder: ["w"]
   *   Press A → keyOrder: ["w", "a"]
   *   Release W → keyOrder: ["a"], emit "left" command
   */
  private keyOrder: string[] = [];

  /**
   * LAST EMITTED COMMAND
   *
   * Tracks the most recently emitted command to avoid redundant
   * emissions when key state changes don't affect the active command.
   *
   * Example: If "forward" was just emitted and key state still
   * results in "forward", no new event is emitted.
   */
  private lastCommand: RobotCommand | null = null;

  /**
   * CONSTRUCTOR
   *
   * Initializes the InputController with required dependencies.
   *
   * @param bus - EventBus for emitting "control:command" events.
   *              All input is translated to events on this bus.
   *
   * Note: The constructor does not attach event listeners.
   * Call init() separately to begin input handling.
   */
  constructor(private bus: EventBus<AppEvents>) {}

  /**
   * INITIALIZE INPUT HANDLING
   *
   * Attaches all event listeners required for input capture.
   * This method should be called once during application startup.
   *
   * KEYBOARD EVENTS:
   * - keydown: Capture key presses, emit movement commands
   * - keyup: Capture key releases, emit stop or switch commands
   *
   * SAFETY EVENTS:
   * - blur: Stop robot when window loses focus
   * - visibilitychange: Stop robot when tab becomes hidden
   *
   * UI BUTTON EVENTS:
   * - mousedown/touchstart: Begin command on button press
   * - mouseup/mouseleave/touchend/touchcancel: Stop command on release
   *
   * EVENT LISTENER BINDING:
   * Keyboard handlers use arrow function class properties to maintain
   * correct 'this' binding. Button handlers are created inline.
   */
  init(): void {
    /*
     * KEYBOARD EVENT LISTENERS
     *
     * Attached to window to capture keyboard input regardless of
     * which element has focus (except when in text inputs).
     */
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);

    /*
     * WINDOW BLUR SAFETY HANDLER
     *
     * When the browser window loses focus (user switches to another
     * application), immediately stop the robot. This prevents the
     * robot from continuing to move when the user can't see or
     * control it.
     */
    window.addEventListener("blur", () => this.emitStop("system"));

    /*
     * PAGE VISIBILITY SAFETY HANDLER
     *
     * When the tab becomes hidden (user switches tabs or minimizes),
     * stop the robot. The Page Visibility API provides reliable
     * detection of tab state changes.
     *
     * This is separate from blur because:
     * - blur: window loses focus but may still be visible
     * - hidden: tab is definitely not visible to user
     */
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.emitStop("system");
      }
    });

    /*
     * UI BUTTON EVENT LISTENERS
     *
     * Find all elements with data-command attribute and attach
     * appropriate event handlers for mouse and touch interaction.
     *
     * Expected HTML structure:
     *   <button data-command="forward">Forward</button>
     *   <button data-command="stop">Stop</button>
     */
    const buttons = document.querySelectorAll<HTMLElement>("[data-command]");
    buttons.forEach((button) => {
      /*
       * Extract the command from the data attribute.
       * TypeScript cannot validate that this matches RobotCommand
       * at compile time, so we cast with caution.
       */
      const command = button.dataset.command as RobotCommand | undefined;
      if (!command) {
        return;
      }

      /*
       * START HANDLER
       *
       * Triggered on mousedown or touchstart.
       * Immediately emits the command for responsive feel.
       * preventDefault() stops default button behavior and text selection.
       */
      const start = (event: Event) => {
        event.preventDefault();
        this.emitCommand(command, "ui");
      };

      /*
       * STOP HANDLER
       *
       * Triggered on mouseup, mouseleave, touchend, or touchcancel.
       * Emits stop command when the button interaction ends.
       *
       * KEYBOARD INTERACTION PROTECTION:
       * If keyboard keys are currently held (activeKeys.size > 0) and
       * this is a movement button (not "stop"), don't emit stop.
       * This prevents UI button release from stopping keyboard-driven movement.
       */
      const stop = (event: Event) => {
        event.preventDefault();
        if (command !== "stop" && this.activeKeys.size > 0) {
          return;
        }
        this.emitStop("ui");
      };

      /*
       * MOUSE EVENTS
       * - mousedown: Begin command
       * - mouseup: End command
       * - mouseleave: End command if cursor leaves button while pressed
       */
      button.addEventListener("mousedown", start);
      button.addEventListener("mouseup", stop);
      button.addEventListener("mouseleave", stop);

      /*
       * TOUCH EVENTS
       * - touchstart: Begin command (with passive: false to allow preventDefault)
       * - touchend: End command
       * - touchcancel: End command (touch interrupted by system)
       *
       * passive: false is required to call preventDefault on touch events,
       * which prevents scrolling while interacting with control buttons.
       */
      button.addEventListener("touchstart", start, { passive: false });
      button.addEventListener("touchend", stop);
      button.addEventListener("touchcancel", stop);
    });
  }

  /**
   * HANDLE KEYDOWN EVENT
   *
   * Processes key press events and emits corresponding commands.
   *
   * Arrow function property ensures correct 'this' binding when
   * used as an event listener callback.
   *
   * FILTERING:
   * - Ignores key repeat events (held key auto-repeat)
   * - Ignores keys pressed while focused on text inputs
   * - Ignores keys not in the command map
   *
   * STATE MANAGEMENT:
   * Updates activeKeys and keyOrder to track multi-key state.
   * Only adds the key if not already in activeKeys (prevents
   * duplicate tracking from browser quirks).
   *
   * @param event - The KeyboardEvent from the browser
   */
  private handleKeyDown = (event: KeyboardEvent): void => {
    /*
     * IGNORE KEY REPEAT
     *
     * When a key is held, browsers fire repeated keydown events.
     * We only want the initial press, not the repeats.
     */
    if (event.repeat || this.isTextInput(event.target)) {
      return;
    }

    /*
     * NORMALIZE KEY NAME
     *
     * Convert to lowercase for consistent comparison.
     * event.key gives us the actual character ("W" → "w").
     */
    const key = event.key.toLowerCase();

    /*
     * LOOKUP COMMAND
     *
     * If the key isn't in our command map, ignore it.
     * This allows other keyboard shortcuts to work normally.
     */
    const command = KEY_COMMAND_MAP[key];
    if (!command) {
      return;
    }

    /*
     * UPDATE KEY TRACKING STATE
     *
     * Add to activeKeys Set and keyOrder array if not already present.
     * The check prevents duplicate entries from edge cases.
     */
    if (!this.activeKeys.has(key)) {
      this.activeKeys.add(key);
      this.keyOrder.push(key);
    }

    /*
     * EMIT COMMAND
     *
     * Update lastCommand and emit the control event.
     * The ControlController will receive this and send to the Pi.
     */
    this.lastCommand = command;
    this.emitCommand(command, "keyboard");
  };

  /**
   * HANDLE KEYUP EVENT
   *
   * Processes key release events and manages command transitions.
   *
   * Arrow function property ensures correct 'this' binding when
   * used as an event listener callback.
   *
   * BEHAVIOR:
   * 1. Remove the released key from tracking
   * 2. If no keys remain pressed, emit stop
   * 3. If other keys are still pressed, switch to the most
   *    recently pressed remaining key's command
   *
   * This enables smooth command transitions when users release
   * keys in different orders than they pressed them.
   *
   * @param event - The KeyboardEvent from the browser
   */
  private handleKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();

    /*
     * IGNORE UNKNOWN KEYS
     *
     * If this key isn't in our active set, it wasn't a tracked
     * control key (or was already released). Ignore it.
     */
    if (!this.activeKeys.has(key)) {
      return;
    }

    /*
     * REMOVE FROM TRACKING
     *
     * Delete from the Set and filter from the order array.
     */
    this.activeKeys.delete(key);
    this.keyOrder = this.keyOrder.filter((item) => item !== key);

    /*
     * ALL KEYS RELEASED → STOP
     *
     * When no control keys are held, emit stop command.
     * This is the most common case: user releases the movement key.
     */
    if (this.keyOrder.length === 0) {
      this.emitStop("keyboard");
      return;
    }

    /*
     * OTHER KEYS STILL HELD → SWITCH COMMAND
     *
     * When multiple keys were held and one is released, switch
     * to the command for the most recently pressed remaining key.
     *
     * Example: W+A pressed, W released → switch to "left" (A's command)
     *
     * Only emit if the command actually changes to avoid redundant events.
     */
    const lastKey = this.keyOrder[this.keyOrder.length - 1];
    const command = KEY_COMMAND_MAP[lastKey];
    if (command && command !== this.lastCommand) {
      this.lastCommand = command;
      this.emitCommand(command, "keyboard");
    }
  };

  /**
   * EMIT CONTROL COMMAND
   *
   * Helper method to emit a control:command event through the EventBus.
   *
   * @param command - The robot command to emit
   * @param source - Where the command originated ("keyboard" or "ui")
   *
   * This centralizes event emission and provides a single point for
   * debugging or extending command handling logic.
   */
  private emitCommand(command: RobotCommand, source: ControlSource): void {
    this.bus.emit("control:command", { command, source });
  }

  /**
   * EMIT STOP COMMAND
   *
   * Helper method specifically for emitting stop commands.
   *
   * @param source - Where the stop originated
   *                 ("keyboard", "ui", or "system" for safety stops)
   *
   * Stop commands are frequent and important enough to warrant
   * a dedicated method for clarity.
   */
  private emitStop(source: ControlSource): void {
    this.bus.emit("control:command", { command: "stop", source });
  }

  /**
   * CHECK IF TARGET IS TEXT INPUT
   *
   * Determines whether the event target is a text input element.
   * When true, keyboard events should be ignored to allow normal
   * typing without triggering robot commands.
   *
   * @param target - The EventTarget from the keyboard event
   *
   * @returns true if the target is an input, textarea, or contenteditable element
   *
   * CHECKED ELEMENTS:
   * - <input>: Text input fields
   * - <textarea>: Multi-line text areas
   * - contenteditable: Rich text editors and editable divs
   *
   * This prevents accidental robot movement when users type in
   * configuration fields or search boxes.
   */
  private isTextInput(target: EventTarget | null): boolean {
    /*
     * Ensure target is an HTMLElement (not null or other types).
     */
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    /*
     * Check tag name and contenteditable attribute.
     * Tag names are uppercase in HTML DOM, so we lowercase for comparison.
     */
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || target.isContentEditable;
  }
}
