import { STORAGE_KEYS } from "./constants";
import type { AppConfig } from "./types";
import type { AppEvents } from "./types";
import type { EventBus } from "../services/eventBus";
import { StorageService } from "../services/storageService";

const defaultConfig: AppConfig = {
  control: {
    speedPercent: 85,
  },
  ai: {
    personDetection: true,
    objectDetection: false,
    confidence: 65,
    temperature: 50,
  },
};

export class ConfigStore {
  constructor(
    private storage: StorageService,
    private bus?: EventBus<AppEvents>,
  ) {}

  getConfig(): AppConfig {
    const stored = this.storage.getJSON(STORAGE_KEYS.config, defaultConfig);
    return {
      control: { ...defaultConfig.control, ...stored.control },
      ai: { ...defaultConfig.ai, ...stored.ai },
    };
  }

  setConfig(config: AppConfig): void {
    this.storage.setJSON(STORAGE_KEYS.config, config);
    this.bus?.emit("config:changed", { config });
  }

  update(partial: Partial<AppConfig>): AppConfig {
    const current = this.getConfig();
    const next: AppConfig = {
      control: { ...current.control, ...partial.control },
      ai: { ...current.ai, ...partial.ai },
    };
    this.setConfig(next);
    return next;
  }
}
