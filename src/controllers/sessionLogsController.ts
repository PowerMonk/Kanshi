import { SessionLogger, type Session } from "../logging/sessionLogger";
import {
  formatDateLabel,
  formatDurationMs,
  formatTimeLabel,
} from "../services/timeService";

const ICON_STYLES = [
  {
    icon: "search_check",
    glow: "glow-primary",
    iconColor: "text-primary",
    card: "bg-surface-container-low",
    border: "border-primary/20",
  },
  {
    icon: "emergency",
    glow: "glow-secondary",
    iconColor: "text-secondary",
    card: "bg-surface-container-high/40",
    border: "border-secondary/20",
  },
  {
    icon: "map",
    glow: "glow-primary",
    iconColor: "text-primary",
    card: "bg-surface-container-low",
    border: "border-primary/20",
  },
  {
    icon: "detection_and_zone",
    glow: "glow-secondary",
    iconColor: "text-secondary",
    card: "bg-surface-container-high/40",
    border: "border-secondary/20",
  },
];

export class SessionLogsController {
  constructor(private logger: SessionLogger) {}

  init(): void {
    const sessions = this.logger.getSessions();

    const total = document.querySelector<HTMLElement>("[data-total-sessions]");
    if (total) {
      total.textContent = String(sessions.length);
    }

    const latest = sessions[0];
    if (latest) {
      updateLatestSession(latest);
    } else {
      updateLatestEmpty();
    }

    const list = document.querySelector<HTMLElement>("[data-session-list]");
    if (list) {
      list.innerHTML = "";
      sessions.forEach((session, index) => {
        list.appendChild(buildSessionItem(session, index));
      });
    }

    const exportButton = document.querySelector<HTMLButtonElement>(
      "[data-export-latest]",
    );
    if (exportButton) {
      exportButton.disabled = !latest;
      exportButton.addEventListener("click", () => {
        if (!latest) {
          return;
        }
        const json = this.logger.exportSession(latest.id);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const safeName = latest.title.replace(/[^a-zA-Z0-9-_]+/g, "_");
        link.href = url;
        link.download = `${safeName}.json`;
        link.click();
        URL.revokeObjectURL(url);
      });
    }
  }
}

function updateLatestSession(session: Session): void {
  const title = document.querySelector<HTMLElement>("[data-latest-title]");
  const date = document.querySelector<HTMLElement>("[data-latest-date]");
  const time = document.querySelector<HTMLElement>("[data-latest-time]");
  const duration = document.querySelector<HTMLElement>(
    "[data-latest-duration]",
  );
  const range = document.querySelector<HTMLElement>("[data-latest-range]");

  if (title) {
    title.textContent = session.title;
  }
  if (date) {
    date.textContent = formatDateLabel(new Date(session.startedAt));
  }
  if (time) {
    time.textContent = formatTimeLabel(new Date(session.startedAt));
  }
  if (duration) {
    duration.textContent = formatDurationMs(getSessionDurationMs(session));
  }
  if (range) {
    range.textContent = "--";
  }
}

function updateLatestEmpty(): void {
  const title = document.querySelector<HTMLElement>("[data-latest-title]");
  const date = document.querySelector<HTMLElement>("[data-latest-date]");
  const time = document.querySelector<HTMLElement>("[data-latest-time]");
  const duration = document.querySelector<HTMLElement>(
    "[data-latest-duration]",
  );
  const range = document.querySelector<HTMLElement>("[data-latest-range]");

  if (title) {
    title.textContent = "No Sessions Yet";
  }
  if (date) {
    date.textContent = "--";
  }
  if (time) {
    time.textContent = "--";
  }
  if (duration) {
    duration.textContent = "0s";
  }
  if (range) {
    range.textContent = "--";
  }
}

function getSessionDurationMs(session: Session): number {
  const end = session.endedAt ?? Date.now();
  return Math.max(0, end - session.startedAt);
}

function buildSessionItem(session: Session, index: number): HTMLElement {
  const style = ICON_STYLES[index % ICON_STYLES.length];
  const wrapper = document.createElement("div");
  wrapper.className = `${style.card} p-6 rounded-lg flex items-center justify-between hover:bg-surface-container-high transition-all group ${style.glow}`;

  const left = document.createElement("div");
  left.className = "flex items-center gap-6";

  const iconWrap = document.createElement("div");
  iconWrap.className = `w-14 h-14 bg-surface-container-highest rounded-full flex items-center justify-center border ${style.border}`;

  const icon = document.createElement("span");
  icon.className = `material-symbols-outlined ${style.iconColor}`;
  icon.textContent = style.icon;

  const textBlock = document.createElement("div");

  const title = document.createElement("h4");
  title.className =
    "font-bold text-xl group-hover:text-primary transition-colors";
  title.textContent = session.title;

  const meta = document.createElement("div");
  meta.className = "flex gap-4 mt-1";

  const date = document.createElement("span");
  date.className =
    "text-xs font-bold text-on-surface-variant flex items-center gap-1";
  date.innerHTML = `<span class=\"material-symbols-outlined text-[1rem]\" data-icon=\"calendar_today\">calendar_today</span> ${formatDateLabel(new Date(session.startedAt))}`;

  const time = document.createElement("span");
  time.className =
    "text-xs font-bold text-on-surface-variant flex items-center gap-1";
  time.innerHTML = `<span class=\"material-symbols-outlined text-[1rem]\" data-icon=\"schedule\">schedule</span> ${formatTimeLabel(new Date(session.startedAt))}`;

  meta.appendChild(date);
  meta.appendChild(time);

  textBlock.appendChild(title);
  textBlock.appendChild(meta);

  iconWrap.appendChild(icon);
  left.appendChild(iconWrap);
  left.appendChild(textBlock);

  const right = document.createElement("div");
  right.className = "flex items-center gap-8";

  const durationBlock = document.createElement("div");
  durationBlock.className = "text-right hidden sm:block";

  const durationLabel = document.createElement("p");
  durationLabel.className =
    "text-[0.6rem] font-bold text-on-surface-variant uppercase tracking-widest";
  durationLabel.textContent = "Duration";

  const durationValue = document.createElement("p");
  durationValue.className = "text-lg font-black";
  durationValue.textContent = formatDurationMs(getSessionDurationMs(session));

  durationBlock.appendChild(durationLabel);
  durationBlock.appendChild(durationValue);
  right.appendChild(durationBlock);

  wrapper.appendChild(left);
  wrapper.appendChild(right);

  return wrapper;
}
