import { ConfigStore } from "../config/configStore";
import type { AppConfig } from "../config/types";

export class AiConfigController {
  constructor(private store: ConfigStore) {}

  init(): void {
    const config = this.store.getConfig();

    const toggleInputs = document.querySelectorAll<HTMLInputElement>(
      "[data-config-toggle]",
    );
    toggleInputs.forEach((toggle) => {
      const key = toggle.dataset.configToggle;
      if (!key) {
        return;
      }
      const value = getConfigValue(config, key);
      if (typeof value === "boolean") {
        toggle.checked = value;
      }
      updateToggleLabel(toggle, value === true);

      toggle.addEventListener("change", () => {
        updateConfig(this.store, key, toggle.checked);
        updateToggleLabel(toggle, toggle.checked);
      });
    });

    const rangeInputs = document.querySelectorAll<HTMLInputElement>(
      "[data-config-range]",
    );
    rangeInputs.forEach((range) => {
      const key = range.dataset.configRange;
      if (!key) {
        return;
      }
      const value = getConfigValue(config, key);
      if (typeof value === "number") {
        range.value = String(value);
        updateRangeOutput(key, value);
      }

      range.addEventListener("input", () => {
        const numeric = Number(range.value);
        updateRangeOutput(key, numeric);
        updateConfig(this.store, key, numeric);
      });
    });
  }
}

function updateToggleLabel(input: HTMLInputElement, isActive: boolean): void {
  const label = input
    .closest("label")
    ?.querySelector<HTMLElement>("[data-toggle-label]");
  if (!label) {
    return;
  }

  const activeClass = label.dataset.activeClass ?? "text-primary";
  const inactiveClass = label.dataset.inactiveClass ?? "text-white/40";

  label.textContent = isActive ? "Active" : "Inactive";
  label.classList.remove(activeClass, inactiveClass);
  label.classList.add(isActive ? activeClass : inactiveClass);
}

function updateRangeOutput(key: string, value: number): void {
  const output = document.querySelector<HTMLElement>(
    `[data-range-output="${key}"]`,
  );
  if (!output) {
    return;
  }
  output.textContent = String(Math.round(value));
}

function getConfigValue(
  config: AppConfig,
  key: string,
): number | boolean | undefined {
  const [group, field] = key.split(".");
  if (group === "ai") {
    return (config.ai as Record<string, number | boolean>)[field];
  }
  if (group === "control") {
    return (config.control as Record<string, number | boolean>)[field];
  }
  return undefined;
}

function updateConfig(
  store: ConfigStore,
  key: string,
  value: number | boolean,
): void {
  const current = store.getConfig();
  const [group, field] = key.split(".");
  const next: AppConfig = {
    control: { ...current.control },
    ai: { ...current.ai },
  };

  if (group === "ai") {
    (next.ai as Record<string, number | boolean>)[field] = value;
  }
  if (group === "control") {
    (next.control as Record<string, number | boolean>)[field] = value;
  }

  store.setConfig(next);
}
