import { STORAGE_KEYS } from "../config/constants";
import { StorageService } from "../services/storageService";
import { formatDateLabel, formatTimeLabel } from "../services/timeService";

export type SessionEvent = {
  timestamp: number;
  type: string;
  data?: unknown;
};

export type Session = {
  id: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  events: SessionEvent[];
};

export class SessionLogger {
  constructor(private storage: StorageService) {}

  getSessions(): Session[] {
    const sessions = this.storage.getJSON<Session[]>(STORAGE_KEYS.sessions, []);
    return sessions.sort((a, b) => b.startedAt - a.startedAt);
  }

  getActiveSessionId(): string | null {
    return this.storage.getJSON<string | null>(
      STORAGE_KEYS.activeSessionId,
      null,
    );
  }

  hasActiveSession(): boolean {
    return this.getActiveSessionId() !== null;
  }

  startSession(title?: string): Session {
    const sessions = this.getSessions();
    const now = Date.now();
    const session: Session = {
      id: createId(),
      title: title ?? buildSessionTitle(now),
      startedAt: now,
      events: [],
    };

    sessions.unshift(session);
    this.storage.setJSON(STORAGE_KEYS.sessions, sessions);
    this.storage.setJSON(STORAGE_KEYS.activeSessionId, session.id);
    this.logEvent("session.start", { sessionId: session.id });
    return session;
  }

  stopSession(reason?: string): Session | null {
    const activeId = this.getActiveSessionId();
    if (!activeId) {
      return null;
    }

    const sessions = this.getSessions();
    const session = sessions.find((item) => item.id === activeId);
    if (!session) {
      this.storage.remove(STORAGE_KEYS.activeSessionId);
      return null;
    }

    session.endedAt = Date.now();
    this.storage.setJSON(STORAGE_KEYS.sessions, sessions);
    this.logEvent("session.stop", { sessionId: session.id, reason });
    this.storage.remove(STORAGE_KEYS.activeSessionId);
    return session;
  }

  logEvent(type: string, data?: unknown): void {
    const activeId = this.getActiveSessionId();
    if (!activeId) {
      return;
    }

    const sessions = this.getSessions();
    const session = sessions.find((item) => item.id === activeId);
    if (!session) {
      return;
    }

    session.events.push({ timestamp: Date.now(), type, data });
    this.storage.setJSON(STORAGE_KEYS.sessions, sessions);
  }

  exportSession(id: string): string {
    const sessions = this.getSessions();
    const session = sessions.find((item) => item.id === id);
    return JSON.stringify(session ?? null, null, 2);
  }
}

function createId(): string {
  if ("crypto" in window && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildSessionTitle(timestamp: number): string {
  const date = new Date(timestamp);
  return `Mission ${formatDateLabel(date)} ${formatTimeLabel(date)}`;
}
