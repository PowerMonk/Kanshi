/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - CONFIGURATION STORE
 * =============================================================================
 *
 * File: src/config/configStore.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The ConfigStore class provides a centralized, persistent configuration
 * management system for the Kanshi desktop application. It serves as the
 * single source of truth for all user-configurable settings, ensuring
 * consistent configuration access across all application components.
 *
 * ARCHITECTURAL ROLE:
 * In Kanshi's event-driven architecture, the ConfigStore acts as both:
 *   1. A data access layer for configuration values
 *   2. An event emitter that notifies subscribers of configuration changes
 *
 * This dual role enables reactive configuration updates without tight
 * coupling between the configuration UI and components that consume
 * configuration values.
 *
 * PERSISTENCE STRATEGY:
 * Configuration is persisted to browser localStorage, providing:
 *   - Survival across page reloads and browser restarts
 *   - No server-side storage requirements (important for offline operation)
 *   - Instant load times (no network round-trip)
 *
 * FORWARD COMPATIBILITY:
 * The ConfigStore handles missing configuration fields gracefully by
 * merging stored values with defaults. This allows adding new configuration
 * options in future versions without breaking existing user data.
 *
 * DEPENDENCIES:
 *   - StorageService: Handles raw localStorage operations with JSON serialization
 *   - EventBus: Provides type-safe pub/sub for configuration change notifications
 *
 * =============================================================================
 */

import { STORAGE_KEYS } from "./constants";
import type { AppConfig } from "./types";
import type { AppEvents } from "./types";
import type { EventBus } from "../services/eventBus";
import { StorageService } from "../services/storageService";

/**
 * DEFAULT APPLICATION CONFIGURATION
 *
 * Defines sensible defaults for all configuration values. These defaults are:
 *   - Used when no stored configuration exists (first launch)
 *   - Merged with stored configuration to fill missing fields
 *   - Designed to provide a safe, functional starting point
 *
 * CONTROL DEFAULTS:
 *   - speedPercent: 85% - Provides responsive movement without being too fast
 *     for indoor testing. The Raspberry Pi server currently uses a fixed 85%
 *     speed, but this value is stored for future variable speed support.
 *
 * AI DEFAULTS:
 *   - personDetection: true - Enabled by default as human detection is the
 *     primary use case for the YOLO integration.
 *   - objectDetection: false - Disabled by default to reduce processing load
 *     and focus detections on the primary use case.
 *   - confidence: 65% - Balanced threshold that catches most valid detections
 *     while filtering obvious false positives.
 *   - temperature: 50% - Neutral setting for inference behavior.
 *
 * These values can be overridden through the AI Configuration page UI.
 */
const defaultConfig: AppConfig = {
  control: {
    speedPercent: 85,
  },
  ai: {
    personDetection: true,
    objectDetection: false,
    confidence: 65,
    temperature: 50,
  },
};

/**
 * CONFIGURATION STORE CLASS
 *
 * Manages application configuration with persistence and change notification.
 *
 * USAGE PATTERN:
 * The ConfigStore is instantiated once during application initialization and
 * passed to components that need configuration access. This dependency
 * injection pattern enables:
 *   - Easy testing with mock configurations
 *   - Clear dependency tracking
 *   - Centralized configuration management
 *
 * EXAMPLE INITIALIZATION:
 *   const storage = new StorageService();
 *   const bus = createEventBus<AppEvents>();
 *   const configStore = new ConfigStore(storage, bus);
 *
 * EXAMPLE USAGE:
 *   // Read current configuration
 *   const config = configStore.getConfig();
 *   console.log(config.ai.confidence);
 *
 *   // Update specific values
 *   configStore.update({ ai: { confidence: 75 } });
 *
 *   // Listen for changes
 *   bus.on("config:changed", ({ config }) => {
 *     console.log("New config:", config);
 *   });
 *
 * THREAD SAFETY:
 * Browser JavaScript is single-threaded, so concurrent access is not a concern.
 * However, event handlers may see configuration changes asynchronously.
 */
export class ConfigStore {
  /**
   * CONSTRUCTOR
   *
   * Initializes the ConfigStore with required dependencies.
   *
   * @param storage - StorageService instance for localStorage operations.
   *                  This abstraction allows for testing with mock storage
   *                  and provides JSON serialization helpers.
   *
   * @param bus - Optional EventBus instance for change notifications.
   *              When provided, configuration changes emit "config:changed"
   *              events. If omitted, changes are silent (useful for testing
   *              or scenarios where reactivity isn't needed).
   *
   * DESIGN NOTE:
   * The EventBus is optional to support use cases where the ConfigStore
   * is used purely for data access without reactive updates. This makes
   * the class more flexible and easier to test in isolation.
   */
  constructor(
    private storage: StorageService,
    private bus?: EventBus<AppEvents>,
  ) {}

  /**
   * GET CONFIGURATION
   *
   * Retrieves the current application configuration, merging stored values
   * with defaults to ensure all fields are present.
   *
   * MERGE STRATEGY:
   * Uses shallow spreading at each domain level (control, ai) to combine
   * default values with stored values. Stored values take precedence,
   * ensuring user preferences are preserved while new default fields are
   * automatically added.
   *
   * MERGE EXAMPLE:
   *   Default:  { ai: { confidence: 65, temperature: 50, newField: 100 } }
   *   Stored:   { ai: { confidence: 80 } }
   *   Result:   { ai: { confidence: 80, temperature: 50, newField: 100 } }
   *
   * This approach enables forward compatibility when adding new configuration
   * options - existing users get the new defaults automatically.
   *
   * @returns Complete AppConfig with all fields populated
   *
   * PERFORMANCE:
   * Reads from localStorage on each call. For frequently accessed configuration
   * in hot paths, consider caching the result. However, for most UI scenarios,
   * the localStorage read is fast enough (< 1ms).
   */
  getConfig(): AppConfig {
    /*
     * Retrieve stored configuration from localStorage, falling back to
     * defaults if nothing is stored. The StorageService.getJSON method
     * handles JSON parsing and returns the default on parse failure.
     */
    const stored = this.storage.getJSON(STORAGE_KEYS.config, defaultConfig);

    /*
     * Merge stored values with defaults at each domain level.
     * Spreading defaults first ensures all fields exist, then spreading
     * stored values overlays any user-specified preferences.
     */
    return {
      control: { ...defaultConfig.control, ...stored.control },
      ai: { ...defaultConfig.ai, ...stored.ai },
    };
  }

  /**
   * SET CONFIGURATION
   *
   * Replaces the entire configuration with a new value and notifies subscribers.
   *
   * PERSISTENCE:
   * The new configuration is immediately serialized to JSON and written to
   * localStorage. This ensures persistence survives browser crashes or
   * unexpected tab closures.
   *
   * EVENT EMISSION:
   * If an EventBus was provided during construction, emits a "config:changed"
   * event with the new configuration. Subscribers can use this to update
   * UI elements, reconfigure services, or trigger other reactions.
   *
   * @param config - Complete AppConfig to store. All fields must be present.
   *                 For partial updates, use the update() method instead.
   *
   * CAUTION:
   * This method performs a complete replacement. Calling setConfig with a
   * partial object will result in missing fields. Always ensure the passed
   * config contains all required fields, or use update() for safe partial
   * updates.
   */
  setConfig(config: AppConfig): void {
    /*
     * Persist to localStorage using the centralized storage key.
     * StorageService handles JSON.stringify internally.
     */
    this.storage.setJSON(STORAGE_KEYS.config, config);

    /*
     * Notify subscribers of the configuration change.
     * The optional chaining (?.) handles the case where no EventBus
     * was provided during construction.
     */
    this.bus?.emit("config:changed", { config });
  }

  /**
   * UPDATE CONFIGURATION (Partial)
   *
   * Safely updates specific configuration values while preserving others.
   * This is the recommended method for making configuration changes, as it
   * prevents accidental data loss from incomplete config objects.
   *
   * MERGE BEHAVIOR:
   * Performs a two-level merge:
   *   1. Top-level domains (control, ai) are merged with current values
   *   2. Properties within each domain are merged with current domain values
   *
   * This allows updating a single field without specifying the entire domain.
   *
   * USAGE EXAMPLES:
   *
   *   // Update just the confidence threshold
   *   configStore.update({ ai: { confidence: 80 } });
   *
   *   // Update multiple values across domains
   *   configStore.update({
   *     control: { speedPercent: 70 },
   *     ai: { confidence: 75, personDetection: false }
   *   });
   *
   *   // Other ai fields (objectDetection, temperature) remain unchanged
   *
   * @param partial - Partial configuration object. Can include any subset
   *                  of AppConfig fields at any nesting level.
   *
   * @returns The complete new configuration after merging
   *
   * ATOMICITY:
   * The read-modify-write operation is atomic in browser JavaScript due to
   * single-threaded execution. No race conditions are possible between
   * getConfig() and setConfig().
   */
  update(partial: Partial<AppConfig>): AppConfig {
    /*
     * Read the current complete configuration to serve as the base
     * for merging partial updates.
     */
    const current = this.getConfig();

    /*
     * Construct the new configuration by merging at each domain level.
     * Current values are spread first, then partial values overlay them.
     * This preserves unspecified fields while applying the updates.
     */
    const next: AppConfig = {
      control: { ...current.control, ...partial.control },
      ai: { ...current.ai, ...partial.ai },
    };

    /*
     * Persist and emit the change event through the setConfig method.
     * This ensures consistent behavior for both full and partial updates.
     */
    this.setConfig(next);

    /*
     * Return the new configuration for convenience. This allows callers
     * to immediately use the updated values without a separate getConfig().
     */
    return next;
  }
}
