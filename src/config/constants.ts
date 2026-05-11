export const PI_HOST = "http://192.168.4.1";
export const STREAM_URL = "http://192.168.4.1:8080/?action=stream";
export const CONTROL_URL = "http://192.168.4.1:5000";

export const STORAGE_KEYS = {
  config: "kanshi.config",
  sessions: "kanshi.sessions",
  activeSessionId: "kanshi.activeSessionId",
};

export const COMMAND_COOLDOWN_MS = 120;
export const CONTROL_REQUEST_TIMEOUT_MS = 1200;
export const STREAM_RECONNECT_BASE_MS = 750;
export const STREAM_RECONNECT_MAX_MS = 5000;
