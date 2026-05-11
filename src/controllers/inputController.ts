import type { AppEvents, ControlSource, RobotCommand } from "../config/types";
import type { EventBus } from "../services/eventBus";

const KEY_COMMAND_MAP: Record<string, RobotCommand> = {
  w: "forward",
  a: "left",
  s: "backward",
  d: "right",
};

export class InputController {
  private activeKeys = new Set<string>();
  private keyOrder: string[] = [];
  private lastCommand: RobotCommand | null = null;

  constructor(private bus: EventBus<AppEvents>) {}

  init(): void {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", () => this.emitStop("system"));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.emitStop("system");
      }
    });

    const buttons = document.querySelectorAll<HTMLElement>("[data-command]");
    buttons.forEach((button) => {
      const command = button.dataset.command as RobotCommand | undefined;
      if (!command) {
        return;
      }

      const start = (event: Event) => {
        event.preventDefault();
        this.emitCommand(command, "ui");
      };
      const stop = (event: Event) => {
        event.preventDefault();
        if (command !== "stop" && this.activeKeys.size > 0) {
          return;
        }
        this.emitStop("ui");
      };

      button.addEventListener("mousedown", start);
      button.addEventListener("touchstart", start, { passive: false });
      button.addEventListener("mouseup", stop);
      button.addEventListener("mouseleave", stop);
      button.addEventListener("touchend", stop);
      button.addEventListener("touchcancel", stop);
    });
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || this.isTextInput(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    const command = KEY_COMMAND_MAP[key];
    if (!command) {
      return;
    }

    if (!this.activeKeys.has(key)) {
      this.activeKeys.add(key);
      this.keyOrder.push(key);
    }
    this.lastCommand = command;
    this.emitCommand(command, "keyboard");
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (!this.activeKeys.has(key)) {
      return;
    }

    this.activeKeys.delete(key);
    this.keyOrder = this.keyOrder.filter((item) => item !== key);

    if (this.keyOrder.length === 0) {
      this.emitStop("keyboard");
      return;
    }

    const lastKey = this.keyOrder[this.keyOrder.length - 1];
    const command = KEY_COMMAND_MAP[lastKey];
    if (command && command !== this.lastCommand) {
      this.lastCommand = command;
      this.emitCommand(command, "keyboard");
    }
  };

  private emitCommand(command: RobotCommand, source: ControlSource): void {
    this.bus.emit("control:command", { command, source });
  }

  private emitStop(source: ControlSource): void {
    this.bus.emit("control:command", { command: "stop", source });
  }

  private isTextInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || target.isContentEditable;
  }
}
