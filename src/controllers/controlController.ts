import type { AppEvents } from "../config/types";
import type { EventBus } from "../services/eventBus";
import { ConfigStore } from "../config/configStore";
import { RobotControlService } from "../services/robotControlService";

export class ControlController {
  constructor(
    private bus: EventBus<AppEvents>,
    private robotService: RobotControlService,
    private configStore: ConfigStore,
  ) {}

  init(): void {
    const config = this.configStore.getConfig();
    this.robotService.setSpeedPercent(config.control.speedPercent);

    this.bus.on("control:command", ({ command }) => {
      void this.robotService.sendCommand(command);
    });

    this.bus.on("config:changed", ({ config: updated }) => {
      this.robotService.setSpeedPercent(updated.control.speedPercent);
    });
  }
}
