# Executable

本页说明三类交付形态：

1) Docker 镜像（推荐生产部署）
2) 容器内运行（docker run / docker compose）
3) 可自启动的二进制包（离线部署）

## Docker（构建）

### 目标

- 后端：FastAPI + Uvicorn（`scripts/autoqa_scan.py --serve`）
- 前端：Vite 构建产物 `autoqa-ui/dist`（静态文件）

当前工程的 UI 使用 `/api` 走代理；生产部署建议用 Nginx 统一提供静态资源并反向代理 `/api` 到后端。

### 示例 Dockerfile（前端 build + 后端运行）

```dockerfile
# stage 1: build ui
FROM node:20-alpine AS ui
WORKDIR /app/autoqa-ui
COPY autoqa-ui/package.json autoqa-ui/package-lock.json ./
RUN npm ci
COPY autoqa-ui/ ./
RUN npm run build

# stage 2: backend
FROM python:3.11-slim AS backend
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir fastapi uvicorn

COPY scripts/ ./scripts/
COPY work/ ./work/
COPY --from=ui /app/autoqa-ui/dist ./autoqa-ui-dist

# 运行时通过 volume 挂载配置与 inputs
EXPOSE 8000
CMD ["python3", "scripts/autoqa_scan.py", "--serve", "--host", "0.0.0.0", "--port", "8000", "--config", "/app/scripts/config.yaml"]
```

说明：

- `scripts/config.yaml` 建议通过挂载覆盖（避免把密钥写进镜像）
- `work/inputs` 建议通过挂载导入项目材料与 rules/config Excel
- UI 静态目录 `autoqa-ui-dist` 需要通过 Nginx 额外提供（或自行扩展后端以提供静态文件）

### 构建镜像

在项目根目录执行：

```bash
docker build -t autoqa:latest .
```

## Docker（运行）

### docker run

```bash
docker run --rm -p 8000:8000 \
  -v /path/to/config.yaml:/app/scripts/config.yaml:ro \
  -v /path/to/work/inputs:/app/work/inputs \
  autoqa:latest
```

### docker compose（示例）

```yaml
services:
  autoqa:
    image: autoqa:latest
    ports:
      - "8000:8000"
    volumes:
      - ./scripts/config.yaml:/app/scripts/config.yaml:ro
      - ./work/inputs:/app/work/inputs
```

```bash
docker compose up -d
docker compose logs -f
```

## 二进制包（自启动）

后端为 Python 程序，常见的“打包成单文件可执行”方案是 PyInstaller。

### 使用 PyInstaller 打包（示例）

```bash
python3 -m pip install -U pyinstaller
pyinstaller -F scripts/autoqa_scan.py --name autoqa-backend
```

产物通常在 `dist/autoqa-backend`（不同平台略有差异）。

运行示例：

```bash
./dist/autoqa-backend --serve --host 0.0.0.0 --port 8000 --config /path/to/config.yaml
```

### 自启动（按操作系统）

macOS（launchd）：创建 plist，开机自启并运行上述命令。

Linux（systemd）：创建 service 文件，`ExecStart` 指向 `autoqa-backend --serve ...`，并启用 `systemctl enable --now autoqa.service`。

Windows：可用 NSSM 或 Windows Service 包装可执行文件，实现开机自启。

注意：

- 二进制包仍需要外部提供 `config.yaml`（建议以文件挂载/部署时下发，不要写死在包内）
- 若需要 UI 的“生产访问”，建议将 `autoqa-ui/dist` 作为静态资源部署到 Nginx/静态站点，并保持 `/api` 反向代理到后端
