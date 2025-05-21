from ultralytics import YOLO
import numpy as np

class Detection:
    def __init__(self):
        self.model = YOLO("runs/detect/train3/weights/best.pt")  # Load the trained model
        #self.train()
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        self.model(dummy)
        #self.model = YOLO("yolov8n.pt").to('cuda' if torch.cuda.is_available() else 'cpu')

    def train(self):
        #self.model = YOLO("yolo11s.pt")  # Load the base model
        #self.model.train(data="coco8.yaml", epochs=20)
        self.model.train(data="traffic-signs.yaml", epochs=50)

    def detect(self, frame):
        # dont print summary
        results = self.model(frame, conf=0.5, iou=0.45, verbose=False)
        return results