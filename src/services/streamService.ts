import {
  STREAM_RECONNECT_BASE_MS,
  STREAM_RECONNECT_MAX_MS,
} from "../config/constants";
import type { AppEvents, StreamStatus } from "../config/types";
import type { EventBus } from "./eventBus";

type StreamOptions = {
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
};

export class MjpegStream {
  private retryCount = 0;
  private reconnectTimer: number | null = null;
  private started = false;

  constructor(
    private image: HTMLImageElement,
    private streamUrl: string,
    private bus?: EventBus<AppEvents>,
    private options: StreamOptions = {},
  ) {}

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.retryCount = 0;
    this.image.addEventListener("load", this.handleLoad);
    this.image.addEventListener("error", this.handleError);
    this.connect();
  }

  stop(): void {
    this.started = false;
    this.image.removeEventListener("load", this.handleLoad);
    this.image.removeEventListener("error", this.handleError);
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.image.removeAttribute("src");
  }

  private connect(): void {
    const cacheBuster = `t=${Date.now()}`;
    const separator = this.streamUrl.includes("?") ? "&" : "?";
    this.emitStatus("connecting");
    this.image.src = `${this.streamUrl}${separator}${cacheBuster}`;
  }

  private handleLoad = (): void => {
    this.retryCount = 0;
    this.emitStatus("live");
  };

  private handleError = (): void => {
    this.emitStatus("error");
    this.scheduleReconnect();
  };

  private scheduleReconnect(): void {
    if (!this.started) {
      return;
    }
    const base = this.options.reconnectBaseMs ?? STREAM_RECONNECT_BASE_MS;
    const max = this.options.reconnectMaxMs ?? STREAM_RECONNECT_MAX_MS;
    const delay = Math.min(base * 2 ** this.retryCount, max);
    this.retryCount += 1;

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  private emitStatus(status: StreamStatus): void {
    this.bus?.emit("stream:status", { status });
  }
}
