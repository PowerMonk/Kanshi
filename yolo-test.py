"""
=============================================================================
KANSHI RC INTELLIGENCE SYSTEM - YOLO DETECTION TEST SCRIPT
=============================================================================

File: yolo-test.py
Execution Context: Desktop PC (Python with CUDA/TensorRT)

PURPOSE:
This standalone script tests YOLO object detection using the local webcam.
It serves as a development tool for validating the YOLO26 model before
integrating it into the main Kanshi web application.

USAGE:
    python yolo-test.py

    - Opens a window showing webcam feed with detected objects
    - Displays FPS counter for performance monitoring
    - Press 'q' to quit

PREREQUISITES:
    - Python 3.8+
    - OpenCV: pip install opencv-python
    - Ultralytics: pip install ultralytics
    - TensorRT (optional): For GPU-accelerated inference
    - CUDA (optional): For NVIDIA GPU acceleration

MODEL FILES:
This script looks for YOLO26 model files in the current directory:
    - yolo26m.engine: TensorRT-optimized model (preferred)
    - yolo26m.pt: PyTorch model weights (fallback)
    - yolo26m.onnx: ONNX format (used for TensorRT export)

MODEL LOADING PRIORITY:
    1. If yolo26m.engine exists → Use TensorRT (fastest)
    2. Else load yolo26m.pt → Use PyTorch
       - If TensorRT available → Export to .engine for future use
       - Else continue with PyTorch inference

PERFORMANCE EXPECTATIONS:
    - TensorRT on RTX GPU: 80-150+ FPS
    - PyTorch on RTX GPU: 40-80 FPS
    - PyTorch on CPU: 5-15 FPS (not recommended for real-time)

RELATIONSHIP TO KANSHI:
This script is separate from the main Kanshi web application. It's used to:
    1. Verify YOLO models work correctly
    2. Test detection performance on the target hardware
    3. Debug model loading and inference issues
    4. Generate TensorRT engines from PyTorch models

The insights from this script inform the future browser-based AI integration
in src/ai/pipeline.ts and src/ai/streamIngestor.ts.

=============================================================================
"""

import cv2
import os
import time
from ultralytics import YOLO

# =============================================================================
# TENSORRT AVAILABILITY CHECK
# =============================================================================
#
# TensorRT provides significant inference speedup on NVIDIA GPUs.
# We check availability at import time to determine the optimal
# inference backend.
#
# TensorRT Benefits:
#   - 2-4x faster inference than PyTorch
#   - Lower latency for real-time applications
#   - Reduced GPU memory usage
#
# If TensorRT is not installed:
#   - PyTorch inference is used (still GPU-accelerated if CUDA available)
#   - Script functions normally, just slower
#   - User is notified to install TensorRT for better performance

try:
    import tensorrt
    TENSORRT_AVAILABLE = True
except ImportError:
    TENSORRT_AVAILABLE = False


def main():
    """
    MAIN INFERENCE LOOP

    This function orchestrates the complete detection pipeline:
    1. Model loading (TensorRT or PyTorch)
    2. Webcam initialization
    3. Frame capture and inference loop
    4. Result visualization
    5. Resource cleanup

    EXCEPTION HANDLING:
    All operations are wrapped in try/finally to ensure proper cleanup
    of camera resources even if errors occur during inference.
    """

    # =========================================================================
    # CONFIGURATION
    # =========================================================================

    # Model naming convention for YOLO26 medium variant
    # Available variants: yolo26n (nano), yolo26s (small), yolo26m (medium),
    #                     yolo26l (large), yolo26x (extra-large)
    model_name = "yolo26m"

    # File paths derived from model name
    engine_file = f"{model_name}.engine"  # TensorRT optimized format
    pt_file = f"{model_name}.pt"          # PyTorch weights

    # =========================================================================
    # CAMERA INITIALIZATION
    # =========================================================================
    # Initialize to None to avoid UnboundLocalError in finally block
    # if an exception occurs before camera initialization
    cap = None

    # =========================================================================
    # MODEL LOADING
    # =========================================================================
    #
    # The Ultralytics YOLO class provides a unified interface for loading
    # models in various formats. It automatically handles:
    #   - .pt files: PyTorch model weights
    #   - .engine files: TensorRT serialized engines
    #   - .onnx files: ONNX intermediate representation

    try:
        # ---------------------------------------------------------------------
        # CHECK FOR TENSORRT ENGINE
        # ---------------------------------------------------------------------
        # TensorRT engines are pre-compiled for specific GPU architectures.
        # If an engine exists, it's the fastest option.

        if os.path.exists(engine_file):
            print(f"Loading TensorRT engine: {engine_file}")
            model = YOLO(engine_file)
            backend = "TensorRT"
        else:
            # -----------------------------------------------------------------
            # LOAD PYTORCH MODEL
            # -----------------------------------------------------------------
            # PyTorch model is the universal fallback. It works on CPU and
            # any CUDA-capable GPU.

            print(f"Loading PyTorch model: {pt_file}")
            model = YOLO(pt_file)
            backend = "PyTorch"

            # -----------------------------------------------------------------
            # OPTIONAL: EXPORT TO TENSORRT
            # -----------------------------------------------------------------
            # If TensorRT is available, convert the PyTorch model to a
            # TensorRT engine for faster inference in future runs.
            #
            # This export can take 1-5 minutes depending on model size
            # and GPU capabilities. The resulting .engine file is cached
            # for subsequent runs.

            if TENSORRT_AVAILABLE:
                print("Exporting model to TensorRT format...")
                try:
                    model.export(format="engine")
                    print(f"TensorRT engine saved as {engine_file}")
                    backend = "TensorRT"  # Update backend after successful export
                except Exception as export_error:
                    # Export can fail due to:
                    # - Incompatible GPU architecture
                    # - Insufficient GPU memory
                    # - TensorRT version mismatch
                    print(f"TensorRT export failed: {export_error}")
                    print("Continuing with PyTorch inference...")
            else:
                # Guide user to install TensorRT for better performance
                print("TensorRT not installed. Install with: pip install tensorrt")
                print("Continuing with PyTorch inference...")

        print(f"Backend: {backend}\n")

        # =====================================================================
        # WEBCAM INITIALIZATION
        # =====================================================================
        #
        # OpenCV's VideoCapture provides a simple interface to webcams.
        # Device index 0 is typically the default/built-in camera.
        #
        # For external USB cameras or specific devices, use different indices
        # or device paths (e.g., "/dev/video0" on Linux).

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("Error: Cannot open webcam")
            return

        print("Starting inference loop. Press 'q' to exit.\n")

        # =====================================================================
        # FPS TRACKING
        # =====================================================================
        # Track time between frames to calculate frames per second.
        # This measures end-to-end performance including:
        #   - Frame capture
        #   - Preprocessing
        #   - Model inference
        #   - Postprocessing
        #   - Visualization

        prev_time = time.time()

        # =====================================================================
        # INFERENCE LOOP
        # =====================================================================
        #
        # Main loop: capture frame → inference → visualize → repeat
        #
        # Loop exits when:
        #   - User presses 'q' key
        #   - Frame capture fails
        #   - Exception occurs

        while True:
            # -----------------------------------------------------------------
            # FRAME CAPTURE
            # -----------------------------------------------------------------
            ret, frame = cap.read()
            if not ret:
                print("Error: Failed to read frame")
                break

            # -----------------------------------------------------------------
            # MIRROR EFFECT
            # -----------------------------------------------------------------
            # Flip horizontally for intuitive "mirror" view.
            # When you move left, the image moves left.
            # This matches typical webcam/video call expectations.
            frame = cv2.flip(frame, 1)

            # -----------------------------------------------------------------
            # RUN INFERENCE
            # -----------------------------------------------------------------
            # The model() call performs:
            #   1. Preprocessing (resize, normalize, convert to tensor)
            #   2. Forward pass through the neural network
            #   3. Postprocessing (NMS, decode bounding boxes)
            #
            # verbose=False suppresses per-frame logging output
            results = model(frame, verbose=False)

            # -----------------------------------------------------------------
            # DRAW DETECTION RESULTS
            # -----------------------------------------------------------------
            # results[0].plot() draws bounding boxes and labels on the frame.
            # It returns a new image with annotations overlaid.
            #
            # Each detection includes:
            #   - Bounding box rectangle
            #   - Class label
            #   - Confidence score
            annotated_frame = results[0].plot()

            # -----------------------------------------------------------------
            # CALCULATE FPS
            # -----------------------------------------------------------------
            # FPS = 1 / time_since_last_frame
            # This gives instantaneous FPS, which may fluctuate.
            # For smoother display, consider averaging over multiple frames.

            current_time = time.time()
            fps = 1 / (current_time - prev_time)
            prev_time = current_time

            # Draw FPS counter in top-left corner
            cv2.putText(annotated_frame, f"FPS: {fps:.1f}", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)

            # -----------------------------------------------------------------
            # DISPLAY FRAME
            # -----------------------------------------------------------------
            # imshow creates/updates a window with the given title.
            # The window is created on first call and reused subsequently.
            cv2.imshow("YOLO Detection", annotated_frame)

            # -----------------------------------------------------------------
            # EXIT HANDLING
            # -----------------------------------------------------------------
            # waitKey(1) waits 1ms for a key press.
            # The 0xFF mask ensures compatibility across platforms.
            # Exit when 'q' is pressed.

            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("\nExiting...")
                break

    except Exception as e:
        # Catch-all for unexpected errors during inference
        print(f"Error: {e}")

    finally:
        # =====================================================================
        # CLEANUP
        # =====================================================================
        # Always release resources, even if an exception occurred.
        # This prevents camera lock-up requiring system restart.

        if cap is not None:
            cap.release()
        cv2.destroyAllWindows()
        print("Camera released and windows closed.")


# =============================================================================
# SCRIPT ENTRY POINT
# =============================================================================
# Standard Python idiom to allow file to be imported without running main()

if __name__ == "__main__":
    main()
