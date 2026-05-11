export type Detection = {
  label: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

// Placeholder for future YOLO/TensorRT integration.
export class VisionPipeline {
  ingestFrame(_frame: ImageData): Detection[] {
    return [];
  }
}
