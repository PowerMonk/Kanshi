export class StorageService {
  constructor(private storage: Storage = localStorage) {}

  getJSON<T>(key: string, fallback: T): T {
    const raw = this.storage.getItem(key);
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  setJSON(key: string, value: unknown): void {
    this.storage.setItem(key, JSON.stringify(value));
  }

  remove(key: string): void {
    this.storage.removeItem(key);
  }
}
