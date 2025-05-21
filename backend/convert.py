import os
import xml.etree.ElementTree as ET
from pathlib import Path
import shutil
import random

# === CONFIG ===
xml_folder = Path("archive/annotations")    # where your .xml files are
image_folder = Path("archive/images")       # where your .jpg/.png images are
output_base = Path("datasets/road_signs")       # where to build YOLO dataset
classes = ["trafficlight", "stop", "speedlimit", "crosswalk"]
train_ratio = 0.8

# === OUTPUT STRUCTURE ===
(train_img, val_img) = (output_base / "images/train", output_base / "images/val")
(train_lbl, val_lbl) = (output_base / "labels/train", output_base / "labels/val")
for d in [train_img, val_img, train_lbl, val_lbl]:
    d.mkdir(parents=True, exist_ok=True)

# === VOC → YOLO Box Converter ===
def convert_bbox(size, box):
    dw = 1. / size[0]
    dh = 1. / size[1]
    x_center = (box[0] + box[2]) / 2.0
    y_center = (box[1] + box[3]) / 2.0
    w = box[2] - box[0]
    h = box[3] - box[1]
    return (x_center * dw, y_center * dh, w * dw, h * dh)

# === Gather All Annotated Samples ===
xml_files = list(xml_folder.glob("*.xml"))
random.shuffle(xml_files)

split_index = int(len(xml_files) * train_ratio)
train_files = xml_files[:split_index]
val_files = xml_files[split_index:]

# === Process Each Set ===
def process_files(xml_file_list, img_dest, lbl_dest):
    for xml_file in xml_file_list:
        tree = ET.parse(xml_file)
        root = tree.getroot()

        filename = root.find("filename").text
        img_path = image_folder / filename
        if not img_path.exists():
            print(f"⚠️ Image not found for: {filename}, skipping.")
            continue

        img_width = int(root.find("size/width").text)
        img_height = int(root.find("size/height").text)

        yolo_lines = []
        for obj in root.findall("object"):
            class_name = obj.find("name").text.lower()
            if class_name not in classes:
                continue
            class_id = classes.index(class_name)
            bndbox = obj.find("bndbox")
            box = (
                int(bndbox.find("xmin").text),
                int(bndbox.find("ymin").text),
                int(bndbox.find("xmax").text),
                int(bndbox.find("ymax").text)
            )
            yolo_box = convert_bbox((img_width, img_height), box)
            yolo_lines.append(f"{class_id} " + " ".join(f"{v:.6f}" for v in yolo_box))

        if yolo_lines:
            # Save label file
            label_path = lbl_dest / f"{xml_file.stem}.txt"
            with open(label_path, "w") as f:
                f.write("\n".join(yolo_lines))

            # Copy image
            shutil.copy(img_path, img_dest / filename)

# Process both train and val sets
process_files(train_files, train_img, train_lbl)
process_files(val_files, val_img, val_lbl)

print(f"✅ Conversion & split complete: {len(train_files)} train, {len(val_files)} val files.")
