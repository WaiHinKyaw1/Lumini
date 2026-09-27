@echo off
title Deploy Latest Code to AWS EC2
echo ========================================================
echo   Deploying updated code and fonts to AWS EC2...
echo ========================================================
echo.
echo 1. Copying server/src/index.mjs and fonts to AWS server...
scp -i "D:\aws\lumini-aws-key.pem" -o StrictHostKeyChecking=no "server\src\index.mjs" ubuntu@16.170.108.153:/tmp/index.mjs
scp -i "D:\aws\lumini-aws-key.pem" -o StrictHostKeyChecking=no "public\fonts\*" ubuntu@16.170.108.153:/tmp/fonts/

echo.
echo 2. Updating container, installing fonts and restarting Lumini Media Worker...
ssh -i "D:\aws\lumini-aws-key.pem" -o StrictHostKeyChecking=no ubuntu@16.170.108.153 "sudo docker exec lumini-media-worker mkdir -p /usr/share/fonts/truetype/burmese /app/data/fonts; sudo docker cp /tmp/index.mjs lumini-media-worker:/app/src/index.mjs; sudo docker cp /tmp/fonts/. lumini-media-worker:/usr/share/fonts/truetype/burmese/; sudo docker cp /tmp/fonts/. lumini-media-worker:/app/data/fonts/; sudo docker exec lumini-media-worker fc-cache -f; sudo docker restart lumini-media-worker && sudo docker ps"

echo.
echo ========================================================
echo   Testing AWS Media Worker Health Status:
echo ========================================================
curl -s http://16.170.108.153:8080/health
echo.
echo.
echo ========================================================
echo   Deployment Complete! Latest server code and fonts active.
echo ========================================================
