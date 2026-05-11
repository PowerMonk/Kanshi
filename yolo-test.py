import cv2
import os
import time
from ultralytics import YOLO

# Check if TensorRT is available
try:
    import tensorrt
    TENSORRT_AVAILABLE = True
except ImportError:
    TENSORRT_AVAILABLE = False
    
def main():
    # Configuration
    model_name = "yolo26m"
    engine_file = f"{model_name}.engine"
    pt_file = f"{model_name}.pt"
    
    # Initialize camera to None to avoid UnboundLocalError in finally block
    cap = None
    
    # Load model: prefer TensorRT engine, fall back to PyTorch
    try:
        if os.path.exists(engine_file):
            print(f"Loading TensorRT engine: {engine_file}")
            model = YOLO(engine_file)
            backend = "TensorRT"
        else:
            print(f"Loading PyTorch model: {pt_file}")
            model = YOLO(pt_file)
            backend = "PyTorch"
            
            # Export to TensorRT for future use (if available)
            if TENSORRT_AVAILABLE:
                print("Exporting model to TensorRT format...")
                try:
                    model.export(format="engine")
                    print(f"TensorRT engine saved as {engine_file}")
                    backend = "TensorRT"  # Update backend after successful export
                except Exception as export_error:
                    print(f"TensorRT export failed: {export_error}")
                    print("Continuing with PyTorch inference...")
            else:
                print("TensorRT not installed. Install with: pip install tensorrt")
                print("Continuing with PyTorch inference...")
        
        print(f"Backend: {backend}\n")
        
        # Open webcam
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("Error: Cannot open webcam")
            return
        
        print("Starting inference loop. Press 'q' to exit.\n")
        
        # FPS tracking
        prev_time = time.time()
        
        # Inference loop
        while True:
            ret, frame = cap.read()
            if not ret:
                print("Error: Failed to read frame")
                break
            
            # Flip camera feed horizontally for mirror effect
            frame = cv2.flip(frame, 1)
            
            # Run inference
            results = model(frame, verbose=False)
            
            # Draw bounding boxes
            annotated_frame = results[0].plot()
            
            # Calculate and display FPS
            current_time = time.time()
            fps = 1 / (current_time - prev_time)
            prev_time = current_time
            
            cv2.putText(annotated_frame, f"FPS: {fps:.1f}", (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
            
            # Display frame
            cv2.imshow("YOLO Detection", annotated_frame)
            
            # Exit on 'q' key
            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("\nExiting...")
                break
    
    except Exception as e:
        print(f"Error: {e}")
    
    finally:
        # Clean up resources
        if cap is not None:
            cap.release()
        cv2.destroyAllWindows()
        print("Camera released and windows closed.")

if __name__ == "__main__":
    main()