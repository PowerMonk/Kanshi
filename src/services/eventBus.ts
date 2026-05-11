type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Handler<any>>>();

  on<K extends keyof Events>(
    event: K,
    handler: Handler<Events[K]>,
  ): () => void {
    const set = this.listeners.get(event) ?? new Set<Handler<any>>();
    set.add(handler as Handler<any>);
    this.listeners.set(event, set);
    return () => set.delete(handler as Handler<any>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler(payload);
    }
  }
}
