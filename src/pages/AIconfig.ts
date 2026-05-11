import type { AppEvents } from "../config/types";
import { AiConfigController } from "../controllers/aiConfigController";
import { SessionController } from "../controllers/sessionController";
import { ConfigStore } from "../config/configStore";
import { SessionLogger } from "../logging/sessionLogger";
import { EventBus } from "../services/eventBus";
import { StorageService } from "../services/storageService";

const bus = new EventBus<AppEvents>();
const storage = new StorageService();
const configStore = new ConfigStore(storage, bus);

new AiConfigController(configStore).init();
new SessionController(bus, new SessionLogger(storage)).init();
