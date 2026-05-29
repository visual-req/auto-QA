# Installation

## Prerequisites

- Python 3
- Node.js 20+
- npm（随 Node.js 一起安装）

## macOS

安装基础软件（Homebrew）：

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

安装 Python 与 Node.js：

```bash
brew install python@3.11 node@20
```

验证：

```bash
python3 --version
node -v
npm -v
```

## Windows

1) 安装 Python（推荐官方安装包）：

- 访问 https://www.python.org/downloads/windows/ 下载并安装
- 勾选 “Add python.exe to PATH”

2) 安装 Node.js 20（推荐官方安装包）：

- 访问 https://nodejs.org/en/download 下载并安装 LTS 版本

验证（PowerShell）：

```powershell
python --version
node -v
npm -v
```

## Linux（Ubuntu/Debian）

安装 Python：

```bash
sudo apt update
sudo apt install -y python3 python3-pip
```

安装 Node.js 20（NodeSource）：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

验证：

```bash
python3 --version
node -v
npm -v
```

## Install project dependencies

安装后端依赖（最小运行集合）：

```bash
python3 -m pip install -U fastapi uvicorn
```

安装前端依赖：

```bash
cd autoqa-ui
npm install
```
