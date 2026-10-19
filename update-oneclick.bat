@echo off
title Update OneClick Service Code on AWS EC2
echo ========================================================
echo   Updating OneClick Python Service on AWS EC2...
echo ========================================================
echo.

set KEY_PATH=D:\aws\lumini-aws-key.pem
set SERVER=ubuntu@16.170.108.153

echo [1/3] Uploading updated oneclick_service.py...
scp -i "%KEY_PATH%" -o StrictHostKeyChecking=no "server\oneclick_service.py" %SERVER%:/tmp/oneclick_service.py
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to scp file to server.
    pause
    exit /b %ERRORLEVEL%
)

echo [2/3] Moving file and restarting lumini-oneclick service...
ssh -i "%KEY_PATH%" -o StrictHostKeyChecking=no %SERVER% "sudo cp /tmp/oneclick_service.py /opt/lumini-oneclick/oneclick_service.py && sudo systemctl restart lumini-oneclick"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to restart service.
    pause
    exit /b %ERRORLEVEL%
)

echo [3/3] Checking health status...
ping 127.0.0.1 -n 3 > nul
curl.exe -s --connect-timeout 5 http://16.170.108.153:8080/api/oneclick/health
echo.
echo ========================================================
echo   OneClick Service updated and live!
echo ========================================================
