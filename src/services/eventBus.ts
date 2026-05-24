/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - EVENT BUS
 * =============================================================================
 *
 * File: src/services/eventBus.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * The EventBus provides a type-safe publish-subscribe (pub/sub) messaging
 * system that serves as the central nervous system of the Kanshi desktop
 * application. It enables loose coupling between components by allowing
 * them to communicate through events rather than direct method calls.
 *
 * ARCHITECTURAL SIGNIFICANCE:
 * In a traditional architecture, components would hold direct references
 * to each other, creating tight coupling and circular dependency risks.
 * The EventBus inverts this relationship:
 *
 *   TRADITIONAL (Tightly Coupled):
 *     InputController → RobotControlService → StatusHud
 *     (Each component knows about the next)
 *
 *   EVENT-DRIVEN (Loosely Coupled):
 *     InputController → EventBus ← RobotControlService
 *                           ↑
 *                       StatusHud
 *     (Components only know about the EventBus)
 *
 * BENEFITS:
 *   - Components can be added/removed without affecting others
 *   - Testing is simplified (mock the EventBus, not all dependencies)
 *   - New features can subscribe to existing events without code changes
 *   - Clear separation between event producers and consumers
 *
 * TYPE SAFETY:
 * Unlike typical JavaScript event emitters that use string event names and
 * untyped payloads, this EventBus uses TypeScript generics to enforce:
 *   - Only defined event names can be emitted/subscribed to
 *   - Event payloads must match their defined types
 *   - Handlers receive properly typed parameters
 *
 * USAGE WITH KANSHI:
 * The EventBus is instantiated with the AppEvents type from types.ts,
 * which defines all valid events and their payload structures:
 *
 *   const bus = new EventBus<AppEvents>();
 *
 * This ensures compile-time errors for invalid event usage:
 *
 *   bus.emit("control:command", { command: "forward", source: "keyboard" }); // OK
 *   bus.emit("control:command", { invalid: "data" }); // Compile error!
 *   bus.emit("nonexistent:event", {}); // Compile error!
 *
 * =============================================================================
 */

/**
 * EVENT HANDLER TYPE
 *
 * Defines the function signature for event handlers.
 *
 * Each handler receives a single payload parameter containing all event data.
 * The generic type T is bound to specific event payload types when handlers
 * are registered, ensuring type safety.
 *
 * DESIGN CHOICE:
 * Using a single payload object (rather than multiple parameters) allows:
 *   - Named properties for clarity
 *   - Easy extension of event data without breaking existing handlers
 *   - Consistent handling across all event types
 *
 * @template T - The type of the event payload
 * @param payload - The event data passed to the handler
 */
type Handler<T> = (payload: T) => void;

/**
 * EVENT BUS CLASS
 *
 * A generic, type-safe implementation of the publish-subscribe pattern.
 *
 * TYPE PARAMETER:
 * The Events generic must be a Record<string, unknown> that maps event names
 * to their payload types. In Kanshi, this is the AppEvents type defined in
 * types.ts.
 *
 * INTERNAL STRUCTURE:
 * The EventBus maintains a Map where:
 *   - Keys are event names (e.g., "control:command")
 *   - Values are Sets of handler functions
 *
 * Using Set for handlers ensures:
 *   - No duplicate registrations of the same handler
 *   - O(1) handler addition and removal
 *   - Efficient iteration during emission
 *
 * EXECUTION ORDER:
 * Handlers are called synchronously in registration order (per Set iteration).
 * This means:
 *   - emit() blocks until all handlers complete
 *   - Handlers should be fast and non-blocking
 *   - Long-running operations should be deferred (setTimeout, requestAnimationFrame)
 *
 * ERROR HANDLING:
 * The current implementation does not catch errors thrown by handlers.
 * A thrown error will prevent subsequent handlers from executing and
 * propagate to the emit() call site. For production robustness, handlers
 * should wrap their logic in try-catch blocks.
 *
 * @template Events - Record mapping event names to payload types
 */
export class EventBus<Events extends Record<string, unknown>> {
  /**
   * INTERNAL LISTENER STORAGE
   *
   * Maps event names to sets of handler functions.
   *
   * Using Map<keyof Events, Set<Handler<any>>> provides:
   *   - Type-safe keys (only valid event names)
   *   - Efficient lookup and modification
   *   - Native support for multiple handlers per event
   *
   * The Handler<any> type is used internally because the Map cannot express
   * the relationship between each key and its corresponding payload type.
   * Type safety is enforced at the public API boundary (on/emit methods).
   */
  private listeners = new Map<keyof Events, Set<Handler<any>>>();

  /**
   * SUBSCRIBE TO EVENT
   *
   * Registers a handler function to be called when the specified event is emitted.
   *
   * TYPE INFERENCE:
   * TypeScript infers the payload type from the event name:
   *
   *   bus.on("control:command", (payload) => {
   *     // payload is automatically typed as:
   *     // { command: RobotCommand; source: ControlSource }
   *   });
   *
   * MULTIPLE SUBSCRIPTIONS:
   * Multiple handlers can subscribe to the same event. Each will be called
   * in registration order when the event is emitted.
   *
   * DUPLICATE PREVENTION:
   * If the same handler function is registered twice for the same event,
   * the Set naturally prevents duplication. The handler will only be called once.
   *
   * @param event - The event name to subscribe to (must be a key of Events)
   * @param handler - Function to call when the event is emitted
   *
   * @returns Unsubscribe function - call this to remove the handler.
   *          The returned function captures the handler reference via closure,
   *          enabling clean removal without external tracking.
   *
   * UNSUBSCRIBE PATTERN:
   * The returned unsubscribe function enables the cleanup pattern:
   *
   *   const unsubscribe = bus.on("stream:status", handleStatus);
   *   // ... later, when cleanup is needed:
   *   unsubscribe();
   *
   * This is essential for preventing memory leaks when components are destroyed.
   */
  on<K extends keyof Events>(
    event: K,
    handler: Handler<Events[K]>,
  ): () => void {
    /*
     * Retrieve the existing handler set for this event, or create a new one
     * if this is the first subscription. The nullish coalescing operator (??)
     * returns the right side only if the left is null or undefined.
     */
    const set = this.listeners.get(event) ?? new Set<Handler<any>>();

    /*
     * Add the handler to the set. The type cast to Handler<any> is necessary
     * because the Map's value type cannot express per-key handler types.
     * Type safety is preserved because the generic K constrains the handler
     * parameter type at the public API level.
     */
    set.add(handler as Handler<any>);

    /*
     * Store the set back into the map. This is necessary when a new Set was
     * created, and harmless when updating an existing entry.
     */
    this.listeners.set(event, set);

    /*
     * Return an unsubscribe function that removes this specific handler.
     * The closure captures the handler reference, enabling removal without
     * requiring the caller to track the handler externally.
     */
    return () => set.delete(handler as Handler<any>);
  }

  /**
   * EMIT EVENT
   *
   * Publishes an event to all subscribed handlers with the given payload.
   *
   * SYNCHRONOUS EXECUTION:
   * All handlers are called synchronously in the same JavaScript event loop tick.
   * This means:
   *   - The calling code waits for all handlers to complete
   *   - Handlers execute in registration order
   *   - An exception in one handler stops subsequent handlers
   *
   * NO SUBSCRIBERS CASE:
   * If no handlers are registered for the event, the method returns immediately
   * without error. This allows events to be emitted even when no one is listening,
   * supporting dynamic subscription patterns.
   *
   * PAYLOAD IMMUTABILITY:
   * Handlers receive the same payload object reference. Mutations by one handler
   * will be visible to subsequent handlers. For safety, emitters should consider
   * payloads immutable, and handlers should not modify them.
   *
   * @param event - The event name to emit (must be a key of Events)
   * @param payload - The event data to pass to handlers (must match event's type)
   *
   * TYPE ENFORCEMENT:
   * TypeScript ensures the payload matches the event's defined type:
   *
   *   bus.emit("control:sent", {
   *     command: "forward",
   *     latencyMs: 42,
   *     ok: true
   *   }); // OK
   *
   *   bus.emit("control:sent", { wrong: "shape" }); // Compile error!
   */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    /*
     * Retrieve the set of handlers for this event.
     * Returns undefined if no handlers are registered.
     */
    const set = this.listeners.get(event);

    /*
     * Early return if no handlers exist. This is an expected case,
     * not an error condition. Events can be emitted before anyone
     * subscribes, and the emission simply has no effect.
     */
    if (!set) {
      return;
    }

    /*
     * Iterate over all registered handlers and invoke each with the payload.
     * The for...of loop iterates Set elements in insertion order, providing
     * predictable execution sequence.
     *
     * Note: We iterate over the current Set contents. If a handler adds or
     * removes handlers during iteration, behavior depends on Set semantics
     * (added handlers may or may not be called, removed handlers may still
     * be called if already queued).
     */
    for (const handler of set) {
      handler(payload);
    }
  }
}
