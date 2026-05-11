import { STREAM_URL } from "../config/constants";
import type { AppEvents } from "../config/types";
import { ConfigStore } from "../config/configStore";
import { ControlController } from "../controllers/controlController";
import { InputController } from "../controllers/inputController";
import { SessionController } from "../controllers/sessionController";
import { StreamController } from "../controllers/streamController";
import { SessionLogger } from "../logging/sessionLogger";
import { EventBus } from "../services/eventBus";
import { RobotControlService } from "../services/robotControlService";
import { StorageService } from "../services/storageService";
import { StatusHud } from "../ui/statusHud";

const bus = new EventBus<AppEvents>();
const storage = new StorageService();
const configStore = new ConfigStore(storage, bus);
const robotService = new RobotControlService(bus);

new ControlController(bus, robotService, configStore).init();
new InputController(bus).init();
new SessionController(bus, new SessionLogger(storage)).init();

const streamImage = document.querySelector<HTMLImageElement>(
  "[data-stream-image]",
);
if (streamImage) {
  const streamUrl = streamImage.dataset.streamUrl ?? STREAM_URL;
  new StreamController(bus).init(streamImage, streamUrl);
}

new StatusHud(bus, {
  status: document.querySelector<HTMLElement>("[data-bot-status]"),
  latency: document.querySelector<HTMLElement>("[data-latency]"),
  stream: document.querySelector<HTMLElement>("[data-stream-status]"),
}).init();
