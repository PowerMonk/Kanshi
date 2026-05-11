import { SessionLogsController } from "../controllers/sessionLogsController";
import { SessionLogger } from "../logging/sessionLogger";
import { StorageService } from "../services/storageService";

const storage = new StorageService();
new SessionLogsController(new SessionLogger(storage)).init();
