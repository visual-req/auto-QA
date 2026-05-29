@echo off
cd /d %~dp0
start /B python ..\scripts\autoqa_scan.py --serve --host 0.0.0.0 --port 8000
npm install
npm run dev -- --host 0.0.0.0 --port 5173
