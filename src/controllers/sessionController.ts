import type { AppEvents } from "../config/types";
import type { EventBus } from "../services/eventBus";
import { SessionLogger } from "../logging/sessionLogger";

export class SessionController {
  private buttons: HTMLButtonElement[] = [];

  constructor(
    private bus: EventBus<AppEvents>,
    private logger: SessionLogger,
  ) {}

  init(): void {
    this.buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-session-toggle]"),
    );
    this.buttons.forEach((button) => {
      button.addEventListener("click", () => this.toggleSession());
    });

    this.updateButtons();

    this.bus.on("control:command", (payload) => {
      this.logger.logEvent("control.command", payload);
    });

    this.bus.on("control:sent", (payload) => {
      this.logger.logEvent("control.sent", payload);
    });

    this.bus.on("stream:status", (payload) => {
      this.logger.logEvent("stream.status", payload);
    });
  }

  private toggleSession(): void {
    if (this.logger.hasActiveSession()) {
      const session = this.logger.stopSession("manual");
      if (session) {
        this.bus.emit("session:stop", {
          sessionId: session.id,
          reason: "manual",
        });
      }
    } else {
      const session = this.logger.startSession();
      this.bus.emit("session:start", { sessionId: session.id });
    }
    this.updateButtons();
  }

  private updateButtons(): void {
    const active = this.logger.hasActiveSession();
    this.buttons.forEach((button) => {
      button.textContent = active ? "STOP SESSION" : "START SESSION";
    });
  }
}
