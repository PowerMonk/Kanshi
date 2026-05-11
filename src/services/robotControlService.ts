import {
  COMMAND_COOLDOWN_MS,
  CONTROL_REQUEST_TIMEOUT_MS,
  CONTROL_URL,
} from "../config/constants";
import type { AppEvents, RobotCommand } from "../config/types";
import type { EventBus } from "./eventBus";
import { fetchWithTimeout } from "../networking/httpClient";

export class RobotControlService {
  private lastCommand: RobotCommand | null = null;
  private lastSentAt = 0;
  private speedPercent = 85;

  constructor(private bus?: EventBus<AppEvents>) {}

  setSpeedPercent(value: number): void {
    this.speedPercent = clamp(value, 0, 100);
  }

  async sendCommand(command: RobotCommand): Promise<void> {
    const now = Date.now();
    if (
      command === this.lastCommand &&
      now - this.lastSentAt < COMMAND_COOLDOWN_MS
    ) {
      return;
    }

    const url = new URL(`${CONTROL_URL}/${command}`);
    // Forward-compatible speed parameter for future Pi updates.
    url.searchParams.set("speed", String(this.speedPercent));
    const startedAt = performance.now();

    try {
      await fetchWithTimeout(url.toString(), {
        timeoutMs: CONTROL_REQUEST_TIMEOUT_MS,
      });
      const latencyMs = Math.round(performance.now() - startedAt);
      this.lastCommand = command;
      this.lastSentAt = now;
      this.bus?.emit("control:sent", { command, latencyMs, ok: true });
    } catch {
      this.bus?.emit("control:sent", { command, latencyMs: null, ok: false });
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
