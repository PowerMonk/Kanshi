export type RobotCommand = "forward" | "backward" | "left" | "right" | "stop";

export type AppConfig = {
  control: {
    speedPercent: number;
  };
  ai: {
    personDetection: boolean;
    objectDetection: boolean;
    confidence: number;
    temperature: number;
  };
};

export type ControlSource = "keyboard" | "ui" | "system";

export type StreamStatus = "connecting" | "live" | "error";

export type AppEvents = {
  "control:command": { command: RobotCommand; source: ControlSource };
  "control:sent": {
    command: RobotCommand;
    latencyMs: number | null;
    ok: boolean;
  };
  "stream:status": { status: StreamStatus; error?: string };
  "session:start": { sessionId: string };
  "session:stop": { sessionId: string; reason?: string };
  "config:changed": { config: AppConfig };
};
