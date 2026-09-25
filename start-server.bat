@echo off
title AWS Lumini Media Worker Manager
echo ========================================================
echo   Connecting to AWS EC2 (16.170.108.153)...
echo ========================================================
echo.
echo Restarting Lumini Media Worker container...
ssh -i "D:\aws\lumini-aws-key.pem" -o StrictHostKeyChecking=no ubuntu@16.170.108.153 "sudo docker restart lumini-media-worker && sudo docker ps"
echo.
echo ========================================================
echo   Worker is running! Test status:
echo ========================================================
curl -s http://16.170.108.153:8080/health
echo.
pause
