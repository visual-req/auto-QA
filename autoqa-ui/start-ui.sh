#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

ROOT_DIR="$(cd .. && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
PY_BIN="python3"
if [ -d "$VENV_DIR" ] && [ -x "$VENV_DIR/bin/python" ]; then
  PY_BIN="$VENV_DIR/bin/python"
else
  python3 -m venv "$VENV_DIR"
  PY_BIN="$VENV_DIR/bin/python"
fi

if ! "$PY_BIN" -c "import fastapi, uvicorn; import pdfplumber; import pypdf; import openpyxl" >/dev/null 2>&1; then
  "$PY_BIN" -m pip install -q fastapi uvicorn pdfplumber pypdf openpyxl python-docx python-pptx xlrd
fi

"$PY_BIN" "$ROOT_DIR/scripts/autoqa_scan.py" --serve --host 0.0.0.0 --port 8000 >/tmp/autoqa-backend.log 2>&1 &
AUTOQA_BACKEND_PID=$!
trap 'kill $AUTOQA_BACKEND_PID >/dev/null 2>&1 || true' EXIT

export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm install 20.19.0
  nvm use 20.19.0
fi

node -v
npm -v

npm install
npm run dev -- --host 0.0.0.0 --port 5173
