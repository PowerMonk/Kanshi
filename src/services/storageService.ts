/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - STORAGE SERVICE
 * =============================================================================
 *
 * File: src/services/storageService.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The StorageService provides a clean abstraction over the browser's Web
 * Storage API (localStorage/sessionStorage). It handles JSON serialization
 * and deserialization, providing type-safe data persistence with graceful
 * error handling.
 *
 * PERSISTENCE ARCHITECTURE:
 * In the Kanshi system, all persistent state is stored client-side in the
 * browser. This design enables:
 *   - Fully offline operation (no server required for storage)
 *   - Instant load times (no network round-trip)
 *   - Privacy (data stays on user's machine)
 *   - Simplicity (no database infrastructure)
 *
 * DATA FLOW:
 *
 *   [Application State]
 *        ↓ setJSON()
 *   [JSON.stringify]
 *        ↓
 *   [localStorage.setItem]
 *        ↓
 *   [Browser Storage] ← persisted across sessions
 *        ↓
 *   [localStorage.getItem]
 *        ↓
 *   [JSON.parse]
 *        ↓ getJSON()
 *   [Application State]
 *
 * STORED DATA:
 * The Kanshi application stores:
 *   - User configuration (speed, AI settings)
 *   - Session history (timestamps, events, detections)
 *   - Active session identifier
 *
 * See STORAGE_KEYS in constants.ts for the complete key enumeration.
 *
 * ERROR HANDLING:
 * The service gracefully handles corrupted or invalid JSON data by
 * returning a fallback value. This prevents application crashes from
 * storage corruption and enables automatic recovery.
 *
 * TESTABILITY:
 * By accepting a Storage interface in the constructor (defaulting to
 * localStorage), the service supports dependency injection of mock
 * storage for testing without browser APIs.
 *
 * =============================================================================
 */

/**
 * STORAGE SERVICE CLASS
 *
 * Provides type-safe JSON persistence using the Web Storage API.
 *
 * This class wraps the low-level Storage interface (localStorage or
 * sessionStorage) with higher-level operations:
 *   - Automatic JSON serialization/deserialization
 *   - Type-safe retrieval with generics
 *   - Graceful fallback on parse errors
 *
 * STORAGE LIMITS:
 * localStorage typically provides 5-10 MB of storage per origin.
 * Session data should be managed to prevent quota exhaustion.
 * The SessionLogger class handles pruning old sessions.
 *
 * SYNCHRONOUS API:
 * Unlike IndexedDB, the Web Storage API is synchronous. This simplifies
 * code but means storage operations can block the main thread briefly.
 * For Kanshi's data sizes, this is negligible (< 1ms).
 *
 * BROWSER SUPPORT:
 * localStorage is supported in all modern browsers and has been stable
 * since IE 8. No polyfill is required.
 */
export class StorageService {
  /**
   * CONSTRUCTOR
   *
   * Initializes the StorageService with a Storage backend.
   *
   * @param storage - The Storage implementation to use. Defaults to
   *                  localStorage for persistent storage across sessions.
   *
   * DEPENDENCY INJECTION:
   * Accepting Storage as a parameter enables:
   *   - Testing with mock storage implementations
   *   - Using sessionStorage for temporary data
   *   - Custom storage backends (e.g., encrypted storage)
   *
   * USAGE EXAMPLES:
   *
   *   // Default: use localStorage (persistent)
   *   const storage = new StorageService();
   *
   *   // Explicit localStorage
   *   const storage = new StorageService(localStorage);
   *
   *   // Session-only storage (cleared on tab close)
   *   const storage = new StorageService(sessionStorage);
   *
   *   // Testing with mock
   *   const mockStorage = new Map<string, string>();
   *   const storage = new StorageService({
   *     getItem: (k) => mockStorage.get(k) ?? null,
   *     setItem: (k, v) => mockStorage.set(k, v),
   *     removeItem: (k) => mockStorage.delete(k),
   *   });
   */
  constructor(private storage: Storage = localStorage) {}

  /**
   * GET JSON VALUE
   *
   * Retrieves and deserializes a JSON value from storage.
   *
   * This method handles three scenarios:
   *   1. Key exists with valid JSON → returns parsed value
   *   2. Key doesn't exist → returns fallback
   *   3. Key exists with invalid JSON → returns fallback (error recovery)
   *
   * TYPE SAFETY:
   * The generic type parameter T allows callers to specify the expected
   * return type. TypeScript will enforce type compatibility with the
   * fallback value and usage context.
   *
   * Note: Runtime type validation is NOT performed. The returned value
   * is cast to T, trusting that the stored data matches the expected shape.
   * For production robustness, consider adding runtime validation (e.g., Zod).
   *
   * @param key - The storage key to retrieve
   * @param fallback - Value to return if key doesn't exist or parse fails
   *
   * @returns The parsed value of type T, or the fallback value
   *
   * ERROR HANDLING:
   * JSON.parse errors are caught and trigger fallback return. This prevents:
   *   - Application crashes from corrupted storage
   *   - Propagation of invalid data through the application
   *
   * USAGE EXAMPLE:
   *
   *   const config = storage.getJSON<AppConfig>("kanshi.config", defaultConfig);
   *   // If storage is empty or corrupted, returns defaultConfig
   */
  getJSON<T>(key: string, fallback: T): T {
    /*
     * Retrieve the raw string value from storage.
     * Returns null if the key doesn't exist.
     */
    const raw = this.storage.getItem(key);

    /*
     * Handle missing key case.
     * Return fallback when no data is stored under this key.
     */
    if (!raw) {
      return fallback;
    }

    try {
      /*
       * Parse the JSON string and cast to the expected type.
       * The 'as T' cast trusts that stored data matches T's shape.
       *
       * WARNING: This does not perform runtime type validation.
       * If the stored data has a different shape than T, the returned
       * object will have that shape, potentially causing runtime errors
       * when accessing expected properties.
       */
      return JSON.parse(raw) as T;
    } catch {
      /*
       * Handle corrupted or invalid JSON.
       * This can occur from:
       *   - Manual storage manipulation
       *   - Partial writes during browser crash
       *   - Storage quota issues
       *
       * Returning fallback allows the application to recover gracefully
       * and re-establish valid state on next save.
       */
      return fallback;
    }
  }

  /**
   * SET JSON VALUE
   *
   * Serializes and stores a value as JSON in storage.
   *
   * This method handles the conversion from JavaScript value to JSON
   * string, then stores it under the specified key.
   *
   * @param key - The storage key to write
   * @param value - Any JSON-serializable value to store
   *
   * SERIALIZATION:
   * JSON.stringify is used, which means:
   *   - Functions are stripped
   *   - undefined values in objects are stripped
   *   - Date objects become ISO strings
   *   - Circular references throw errors
   *
   * QUOTA HANDLING:
   * This method does not catch quota exceeded errors. Callers should
   * handle QuotaExceededError if storing large amounts of data.
   * For Kanshi's typical usage (config + sessions), quota issues are rare.
   *
   * ATOMICITY:
   * localStorage.setItem is atomic at the key level. The entire value
   * is written or the operation fails; partial writes don't occur.
   *
   * USAGE EXAMPLE:
   *
   *   storage.setJSON("kanshi.config", {
   *     control: { speedPercent: 85 },
   *     ai: { confidence: 70 }
   *   });
   */
  setJSON(key: string, value: unknown): void {
    /*
     * Serialize the value to JSON and store it.
     * JSON.stringify handles nested objects and arrays automatically.
     */
    this.storage.setItem(key, JSON.stringify(value));
  }

  /**
   * REMOVE VALUE
   *
   * Deletes a value from storage.
   *
   * This method removes the key-value pair entirely from storage.
   * Subsequent getItem calls for this key will return null.
   *
   * @param key - The storage key to remove
   *
   * IDEMPOTENCY:
   * Calling remove() on a non-existent key is safe and has no effect.
   * This enables cleanup code to run without existence checks.
   *
   * USE CASES:
   *   - Clearing user data on logout
   *   - Resetting to default configuration
   *   - Cleaning up obsolete storage keys during migrations
   *
   * USAGE EXAMPLE:
   *
   *   storage.remove("kanshi.activeSessionId");
   *   // The active session ID is no longer stored
   */
  remove(key: string): void {
    this.storage.removeItem(key);
  }
}
