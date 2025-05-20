#!/bin/bash
set -euxo pipefail
LOG_FILE="/tmp/deploy_debug.log"
echo "Running $(basename "$0")..." >> "$LOG_FILE"

echo "Installing backend..." >> "$LOG_FILE"

cd /home/ec2-user/trafficSigns/backend
mkdir -p logs
python3.12 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt