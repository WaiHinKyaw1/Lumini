@echo off
title Deploy OneClick Recap Service to AWS EC2
echo ========================================================
echo   Deploying OneClick Recap EN-to-MM Service to AWS...
echo ========================================================
echo.

set KEY_PATH=D:\aws\lumini-aws-key.pem
set SERVER=ubuntu@16.170.108.153

echo [1/5] Copying OneClick service files to AWS server...
scp -i "%KEY_PATH%" -o StrictHostKeyChecking=no "server\oneclick_service.py" %SERVER%:/tmp/oneclick_service.py
scp -i "%KEY_PATH%" -o StrictHostKeyChecking=no "server\oneclick_requirements.txt" %SERVER%:/tmp/oneclick_requirements.txt
echo.

echo [2/5] Installing Python 3 and pip on server (if not present)...
ssh -i "%KEY_PATH%" -o StrictHostKeyChecking=no %SERVER% "sudo apt-get update -qq && sudo apt-get install -y -qq python3 python3-pip python3-venv ffmpeg"
echo.

echo [3/5] Setting up OneClick service directory and venv...
ssh -i "%KEY_PATH%" -o StrictHostKeyChecking=no %SERVER% "sudo mkdir -p /opt/lumini-oneclick && sudo cp /tmp/oneclick_service.py /opt/lumini-oneclick/ && sudo cp /tmp/oneclick_requirements.txt /opt/lumini-oneclick/ && cd /opt/lumini-oneclick && sudo python3 -m venv venv 2>/dev/null; sudo /opt/lumini-oneclick/venv/bin/pip install --upgrade pip && sudo /opt/lumini-oneclick/venv/bin/pip install -r oneclick_requirements.txt"
echo.

echo [4/5] Creating systemd service for auto-start...
ssh -i "%KEY_PATH%" -o StrictHostKeyChecking=no %SERVER% "sudo tee /etc/systemd/system/lumini-oneclick.service > /dev/null << 'SVCEOF'
[Unit]
Description=Lumini OneClick Recap EN-MM Service
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/lumini-oneclick
Environment=GEMINI_API_KEY=%GEMINI_API_KEY%
Environment=ONECLICK_PORT=8090
Environment=ONECLICK_DATA_DIR=/opt/lumini-oneclick/data
ExecStart=/opt/lumini-oneclick/venv/bin/python oneclick_service.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF
sudo systemctl daemon-reload && sudo systemctl enable lumini-oneclick && sudo systemctl restart lumini-oneclick"
echo.

echo [5/5] Checking service status...
ssh -i "%KEY_PATH%" -o StrictHostKeyChecking=no %SERVER% "sleep 3 && sudo systemctl status lumini-oneclick --no-pager -l"
echo.

echo ========================================================
echo   Testing OneClick Health Endpoint:
echo ========================================================
curl -s http://16.170.108.153:8090/api/oneclick/health
echo.
echo.
echo ========================================================
echo   OneClick Deployment Complete!
echo   Service URL: http://16.170.108.153:8090
echo   Health:      http://16.170.108.153:8090/api/oneclick/health
echo ========================================================
pause
