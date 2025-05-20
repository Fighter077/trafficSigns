# Paths
BUILD_DIR="/home/ec2-user/trafficSigns/frontend/dist"
TARGET_DIR="/usr/share/nginx/html"

# Clean old files
sudo rm -rf "$TARGET_DIR"/*

# Copy new build
sudo cp -r "$BUILD_DIR"/trafficSigns-ang/browser/* "$TARGET_DIR"/

sudo chown -R nginx:nginx "$TARGET_DIR"