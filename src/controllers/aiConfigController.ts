/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - AI CONFIGURATION CONTROLLER
 * =============================================================================
 *
 * File: src/controllers/aiConfigController.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The AiConfigController manages the AI Configuration page interface,
 * binding UI form elements to the application's configuration store.
 * It enables users to customize AI detection settings and motor control
 * parameters through toggles and sliders.
 *
 * CONFIGURATION CATEGORIES:
 *
 *   1. AI DETECTION SETTINGS
 *      - Person Detection: Enable/disable human figure detection
 *      - Object Detection: Enable/disable general object detection
 *      - Confidence: Minimum confidence threshold (0-100%)
 *      - Temperature: Inference behavior parameter (0-100%)
 *
 *   2. MOTOR CONTROL SETTINGS
 *      - Speed Percent: Motor speed for movement commands (0-100%)
 *
 * UI BINDING PATTERN:
 * The controller uses data attributes to bind form elements to config fields:
 *
 *   TOGGLE INPUTS (checkboxes):
 *     <input type="checkbox" data-config-toggle="ai.personDetection">
 *
 *   RANGE INPUTS (sliders):
 *     <input type="range" data-config-range="ai.confidence">
 *     <span data-range-output="ai.confidence">65</span>
 *
 * DATA ATTRIBUTE FORMAT:
 * Configuration keys use dot notation: "group.field"
 *   - "ai.confidence" → config.ai.confidence
 *   - "control.speedPercent" → config.control.speedPercent
 *
 * BIDIRECTIONAL BINDING:
 * On initialization, the controller:
 *   1. Reads current config values
 *   2. Sets form element states to match
 *
 * On user interaction:
 *   1. Reads new form element values
 *   2. Updates the config store
 *   3. ConfigStore emits config:changed event
 *   4. Other components react to the change
 *
 * PERSISTENCE:
 * All configuration changes are immediately persisted to localStorage
 * via the ConfigStore. Settings survive page reloads and browser restarts.
 *
 * =============================================================================
 */

import { ConfigStore } from "../config/configStore";
import type { AppConfig } from "../config/types";

/**
 * AI CONFIGURATION CONTROLLER CLASS
 *
 * Manages the AI Configuration page's form elements and their
 * synchronization with the application's configuration store.
 *
 * This controller follows the "form controller" pattern:
 *   - Initializes form state from data model
 *   - Attaches event listeners for user changes
 *   - Updates data model in response to changes
 *   - Updates related UI elements (labels, outputs)
 *
 * STATELESS DESIGN:
 * The controller itself doesn't hold configuration state.
 * All state is maintained in the ConfigStore, ensuring a
 * single source of truth. The controller only bridges
 * between DOM elements and the store.
 */
export class AiConfigController {
  /**
   * CONSTRUCTOR
   *
   * Initializes the controller with the ConfigStore dependency.
   *
   * @param store - ConfigStore instance for reading and writing
   *                configuration values. This is the authoritative
   *                source of configuration state.
   */
  constructor(private store: ConfigStore) {}

  /**
   * INITIALIZE CONTROLLER
   *
   * Sets up all form element bindings for the configuration page.
   *
   * INITIALIZATION PROCESS:
   *
   *   1. LOAD CURRENT CONFIGURATION
   *      Read all values from the ConfigStore.
   *
   *   2. SETUP TOGGLE INPUTS (Checkboxes)
   *      - Find all elements with data-config-toggle
   *      - Set checked state from config
   *      - Update associated status labels
   *      - Attach change event handlers
   *
   *   3. SETUP RANGE INPUTS (Sliders)
   *      - Find all elements with data-config-range
   *      - Set value from config
   *      - Update associated output displays
   *      - Attach input event handlers
   *
   * DECLARATIVE BINDING:
   * Form elements self-describe their config binding via data attributes.
   * This enables adding new config fields by simply adding HTML elements
   * with appropriate data attributes, without modifying JavaScript.
   */
  init(): void {
    /*
     * Load the current configuration from storage.
     * This provides the initial values for all form elements.
     */
    const config = this.store.getConfig();

    /*
     * =========================================================================
     * TOGGLE INPUTS (CHECKBOXES)
     * =========================================================================
     *
     * Find all checkbox inputs that control boolean config values.
     * These use the data-config-toggle attribute with the config key.
     *
     * Expected HTML structure:
     *   <label>
     *     <input type="checkbox" data-config-toggle="ai.personDetection">
     *     <span data-toggle-label
     *           data-active-class="text-primary"
     *           data-inactive-class="text-white/40">Active</span>
     *   </label>
     */
    const toggleInputs = document.querySelectorAll<HTMLInputElement>(
      "[data-config-toggle]",
    );

    toggleInputs.forEach((toggle) => {
      /*
       * Extract the config key from the data attribute.
       * Example: "ai.personDetection"
       */
      const key = toggle.dataset.configToggle;
      if (!key) {
        return;
      }

      /*
       * Look up the current config value for this key.
       * getConfigValue handles parsing "group.field" notation.
       */
      const value = getConfigValue(config, key);

      /*
       * Set the checkbox checked state if the config value is boolean.
       * Non-boolean values (unexpected) are ignored.
       */
      if (typeof value === "boolean") {
        toggle.checked = value;
      }

      /*
       * Update the associated status label ("Active"/"Inactive").
       * The label styling changes based on the toggle state.
       */
      updateToggleLabel(toggle, value === true);

      /*
       * CHANGE EVENT HANDLER
       *
       * When the user toggles the checkbox:
       *   1. Update the config store with the new value
       *   2. Update the visual status label
       *
       * The ConfigStore will emit config:changed, which other
       * components (like ControlController) can react to.
       */
      toggle.addEventListener("change", () => {
        updateConfig(this.store, key, toggle.checked);
        updateToggleLabel(toggle, toggle.checked);
      });
    });

    /*
     * =========================================================================
     * RANGE INPUTS (SLIDERS)
     * =========================================================================
     *
     * Find all range inputs that control numeric config values.
     * These use the data-config-range attribute with the config key.
     *
     * Expected HTML structure:
     *   <input type="range" data-config-range="ai.confidence" min="0" max="100">
     *   <span data-range-output="ai.confidence">65</span>
     */
    const rangeInputs = document.querySelectorAll<HTMLInputElement>(
      "[data-config-range]",
    );

    rangeInputs.forEach((range) => {
      /*
       * Extract the config key from the data attribute.
       * Example: "ai.confidence"
       */
      const key = range.dataset.configRange;
      if (!key) {
        return;
      }

      /*
       * Look up the current config value for this key.
       */
      const value = getConfigValue(config, key);

      /*
       * Set the range input value if the config value is numeric.
       * Also update the associated output display.
       */
      if (typeof value === "number") {
        range.value = String(value);
        updateRangeOutput(key, value);
      }

      /*
       * INPUT EVENT HANDLER
       *
       * Using "input" (not "change") provides real-time updates
       * as the user drags the slider, giving immediate feedback.
       *
       * On each movement:
       *   1. Parse the new numeric value
       *   2. Update the output display
       *   3. Update the config store
       *
       * The config is updated continuously during drag, which
       * means many rapid config writes. This is acceptable for
       * localStorage performance and provides instant feedback.
       */
      range.addEventListener("input", () => {
        const numeric = Number(range.value);
        updateRangeOutput(key, numeric);
        updateConfig(this.store, key, numeric);
      });
    });
  }
}

/**
 * UPDATE TOGGLE LABEL
 *
 * Updates the visual appearance of a toggle's status label.
 *
 * The label element must be inside the same parent <label> as the
 * checkbox and have the data-toggle-label attribute.
 *
 * STYLING:
 * The label supports custom CSS classes for active/inactive states
 * via data-active-class and data-inactive-class attributes.
 * Defaults to "text-primary" and "text-white/40" if not specified.
 *
 * @param input - The checkbox input element
 * @param isActive - Whether the toggle is currently active (checked)
 *
 * VISUAL FEEDBACK:
 * - Active: Label shows "Active" with primary color
 * - Inactive: Label shows "Inactive" with dimmed color
 */
function updateToggleLabel(input: HTMLInputElement, isActive: boolean): void {
  /*
   * Find the label element within the parent <label> element.
   * closest("label") finds the containing label tag,
   * then we query for the element with data-toggle-label.
   */
  const label = input
    .closest("label")
    ?.querySelector<HTMLElement>("[data-toggle-label]");

  if (!label) {
    return;
  }

  /*
   * Get the CSS classes for each state from data attributes,
   * falling back to sensible defaults.
   */
  const activeClass = label.dataset.activeClass ?? "text-primary";
  const inactiveClass = label.dataset.inactiveClass ?? "text-white/40";

  /*
   * Update the label text and styling.
   * Remove both classes first, then add the appropriate one.
   */
  label.textContent = isActive ? "Active" : "Inactive";
  label.classList.remove(activeClass, inactiveClass);
  label.classList.add(isActive ? activeClass : inactiveClass);
}

/**
 * UPDATE RANGE OUTPUT
 *
 * Updates the displayed value for a range slider.
 *
 * The output element is found by matching data-range-output
 * attribute with the config key.
 *
 * @param key - The config key (e.g., "ai.confidence")
 * @param value - The numeric value to display
 *
 * VALUES ARE ROUNDED:
 * Floating point values are rounded to integers for cleaner display.
 * Configuration values are percentages, so fractional values aren't
 * meaningful to users.
 */
function updateRangeOutput(key: string, value: number): void {
  /*
   * Find the output element by matching the key.
   * Example: key="ai.confidence" matches element with
   * data-range-output="ai.confidence"
   */
  const output = document.querySelector<HTMLElement>(
    `[data-range-output="${key}"]`,
  );

  if (!output) {
    return;
  }

  /*
   * Display the rounded integer value.
   */
  output.textContent = String(Math.round(value));
}

/**
 * GET CONFIGURATION VALUE
 *
 * Retrieves a specific value from the config using dot-notation key.
 *
 * @param config - The complete AppConfig object
 * @param key - Dot-notation key (e.g., "ai.confidence")
 *
 * @returns The config value (number or boolean), or undefined if not found
 *
 * KEY FORMAT:
 * Keys use "group.field" notation:
 *   - "ai.confidence" → config.ai.confidence
 *   - "control.speedPercent" → config.control.speedPercent
 *
 * SUPPORTED GROUPS:
 * Currently supports "ai" and "control" groups.
 * Unknown groups return undefined.
 *
 * TYPE HANDLING:
 * Returns number | boolean | undefined because config fields
 * can be either type. Callers should check the type before use.
 */
function getConfigValue(
  config: AppConfig,
  key: string,
): number | boolean | undefined {
  /*
   * Split the key into group and field parts.
   * Example: "ai.confidence" → group="ai", field="confidence"
   */
  const [group, field] = key.split(".");

  /*
   * Look up the value in the appropriate config section.
   * Type assertions are needed because TypeScript can't
   * verify the field name at compile time.
   */
  if (group === "ai") {
    return (config.ai as Record<string, number | boolean>)[field];
  }
  if (group === "control") {
    return (config.control as Record<string, number | boolean>)[field];
  }

  return undefined;
}

/**
 * UPDATE CONFIGURATION
 *
 * Updates a specific configuration value using dot-notation key.
 *
 * @param store - The ConfigStore to update
 * @param key - Dot-notation key (e.g., "ai.confidence")
 * @param value - The new value (number or boolean)
 *
 * UPDATE PROCESS:
 *   1. Read current configuration
 *   2. Create a copy with the updated field
 *   3. Write the new configuration to the store
 *
 * The ConfigStore's setConfig method handles:
 *   - Persistence to localStorage
 *   - Emitting config:changed event
 *
 * IMMUTABILITY:
 * The function creates a new config object rather than mutating
 * the existing one. This ensures consistent behavior and enables
 * change detection in reactive systems.
 */
function updateConfig(
  store: ConfigStore,
  key: string,
  value: number | boolean,
): void {
  /*
   * Read the current configuration as the base for updates.
   */
  const current = store.getConfig();

  /*
   * Parse the key into group and field.
   */
  const [group, field] = key.split(".");

  /*
   * Create a new config object with shallow copies of each section.
   * This ensures we don't mutate the original config.
   */
  const next: AppConfig = {
    control: { ...current.control },
    ai: { ...current.ai },
  };

  /*
   * Update the appropriate field based on the group.
   * Type assertions allow dynamic field access.
   */
  if (group === "ai") {
    (next.ai as Record<string, number | boolean>)[field] = value;
  }
  if (group === "control") {
    (next.control as Record<string, number | boolean>)[field] = value;
  }

  /*
   * Persist the updated configuration.
   * This triggers config:changed event for reactive updates.
   */
  store.setConfig(next);
}
