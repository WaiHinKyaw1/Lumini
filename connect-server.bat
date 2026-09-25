@echo off
title Connect to AWS EC2 (SSH)
echo Connecting to AWS EC2 (16.170.108.153) via SSH...
ssh -i "D:\aws\lumini-aws-key.pem" -o StrictHostKeyChecking=no ubuntu@16.170.108.153
pause
