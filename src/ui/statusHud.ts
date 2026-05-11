import type { AppEvents, RobotCommand, StreamStatus } from "../config/types";
import type { EventBus } from "../services/eventBus";

type StatusElements = {
  status?: HTMLElement | null;
  latency?: HTMLElement | null;
  stream?: HTMLElement | null;
};

export class StatusHud {
  constructor(
    private bus: EventBus<AppEvents>,
    private elements: StatusElements,
  ) {}

  init(): void {
    this.bus.on("control:command", ({ command }) => {
      if (this.elements.status) {
        this.elements.status.innerHTML = formatBotStatus(command);
      }
    });

    this.bus.on("control:sent", ({ latencyMs }) => {
      if (this.elements.latency) {
        const label = latencyMs === null ? "--" : `${latencyMs}ms`;
        this.elements.latency.textContent = `Latency: ${label}`;
      }
    });

    this.bus.on("stream:status", ({ status }) => {
      if (this.elements.stream) {
        this.elements.stream.textContent = formatStreamStatus(status);
      }
    });
  }
}

function formatBotStatus(command: RobotCommand): string {
  if (command === "stop") {
    return 'IDLE <span class="text-primary opacity-50">&bull;</span> <span class="text-sm font-medium text-white/60">STANDBY</span>';
  }
  return `${command.toUpperCase()} <span class=\"text-primary opacity-50\">&bull;</span> <span class=\"text-sm font-medium text-white/60\">ACTIVE</span>`;
}

function formatStreamStatus(status: StreamStatus): string {
  if (status === "live") {
    return "Live Feed: ONLINE";
  }
  if (status === "connecting") {
    return "Live Feed: CONNECTING";
  }
  return "Live Feed: RECONNECTING";
}
