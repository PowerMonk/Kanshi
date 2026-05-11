import type { AppEvents } from "../config/types";
import type { EventBus } from "../services/eventBus";
import { MjpegStream } from "../services/streamService";

export class StreamController {
  private stream: MjpegStream | null = null;

  constructor(private bus: EventBus<AppEvents>) {}

  init(image: HTMLImageElement, url: string): void {
    this.stream = new MjpegStream(image, url, this.bus);
    this.stream.start();

    document.addEventListener("visibilitychange", () => {
      if (!this.stream) {
        return;
      }
      if (document.hidden) {
        this.stream.stop();
      } else {
        this.stream.start();
      }
    });
  }
}
