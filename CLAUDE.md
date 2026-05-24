# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kanshi RC Intelligence System is a remote-controlled robot platform with edge-based AI processing. The Raspberry Pi 4 acts as a lightweight hardware node (motor control + video streaming) while the laptop runs the main UI and all heavy AI/processing workloads.

**Key constraint**: The Raspberry Pi does NO processing - it only transmits video and receives HTTP commands. All AI/processing happens on the laptop.

## Build & Run Commands

```bash
bun install              # Install dependencies
bun run build            # Build TypeScript to browser bundles (/frontend/dist/)
bun run dev              # Build + run dev server (port 3000)
bun run serve            # Run production server
```

## Architecture

### Network Endpoints (Raspberry Pi Hotspot)

- **Video stream**: `http://192.168.4.1:8080/?action=stream` (MJPEG)
- **Control API**: `http://192.168.4.1:5000` (Flask)
  - `GET /forward`, `/backward`, `/left`, `/right`, `/stop`

### Directory Structure

```
src/
├── ai/           # AI pipeline (YOLO/TensorRT prep, not yet implemented)
├── config/       # Constants, types, config store with event emission
├── controllers/  # Business logic (stream, input, control, session)
├── services/     # EventBus, robotControlService, streamService, storage
├── ui/           # StatusHud, DOM utilities
├── logging/      # Session event logging
├── networking/   # HTTP client with timeout wrapper
└── pages/        # Entry points: index.ts, AIconfig.ts, SessionLogs.ts
```

### Event-Driven Architecture

The app uses a type-safe EventBus pattern. Key events:
- `control:command` - User input (WASD/buttons)
- `control:sent` - Command sent to Pi with latency
- `stream:status` - Video stream state changes
- `session:start/stop` - Session lifecycle
- `config:changed` - Config updates

### Key Constants

- `COMMAND_COOLDOWN_MS`: 120ms (prevents command spam)
- `CONTROL_REQUEST_TIMEOUT_MS`: 1200ms
- `STREAM_RECONNECT_BASE_MS`: 750ms (exponential backoff to 5000ms max)

## Design Principles

- **No heavy frameworks**: Pure TypeScript, no React/Vue
- **Event-driven**: Loose coupling between modules
- **Local only**: Works on private WiFi, no cloud dependencies
- **Modular**: Prepared for YOLO integration without breaking existing code

## YOLO Integration (Prepared, Not Implemented)

Model files available: `yolo26m.engine`, `yolo26m.onnx`, `yolo26m.pt`

The `src/ai/` directory has stubs for stream ingestion and inference pipeline.

## Hardware (Raspberry Pi)

`server-side.py` runs Flask server controlling motor PWM on GPIO pins. Currently uses fixed 85% speed. Architecture supports future configurable speed parameter.
