import cv2 # type: ignore
import os

def save_snapshot(filename, img):
    os.makedirs("snapshots", exist_ok=True)
    cv2.imwrite(filename, img)
    print(f"✅ Saved snapshot to {filename}")

#def save_results_to_json(results, filename="detections.json"):
#    detections = []
#    for result in results:
#        classes = result.names#
#
#        for box in result.boxes:
#            detections.append({
#                "class": classes[int(box.cls[0])],
#                "confidence": float(box.conf[0]),
#                "bbox": box.xyxy[0].tolist()
#            })
#    with open(filename, "w") as f:
#        json.dump(detections, f, indent=2)

def convert_to_relative(box, image_width, image_height):
    x1, y1, x2, y2 = box
    return [
        x1 / image_width,
        y1 / image_height,
        x2 / image_width,
        y2 / image_height
    ]

def convert_results(results, image_width, image_height):
    output = []
    for result in results:
        boxes = result.boxes

        if not boxes:
            continue

        xyxy = boxes.xyxy.cpu().numpy()
        conf = boxes.conf.cpu().numpy()
        cls = boxes.cls.cpu().numpy()
        class_names = result.names

        for i in range(len(boxes)):
            x1, y1, x2, y2 = xyxy[i]
            rel_bbox = [
                float(x1 / image_width),
                float(y1 / image_height),
                float(x2 / image_width),
                float(y2 / image_height)
            ]
            output.append({
                "class": class_names[int(cls[i])],
                "confidence": float(conf[i]),
                "bbox": rel_bbox
            })
    return output