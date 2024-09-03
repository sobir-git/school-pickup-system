@echo off
:loop
node server.js --serve-frontend >> server.log 2>&1
echo Server crashed. Restarting in 5 seconds... >> server.log
timeout /t 5
goto loop