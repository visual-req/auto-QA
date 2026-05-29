# auto-QA

## 文档入口

- 文档目录：[docs/](docs/)
- 快速上手：[docs/getting-started.md](docs/getting-started.md)
- 安装指南：[docs/installation.md](docs/installation.md)
- 目录结构（inputs/rules/outputs）：[docs/structure.md](docs/structure.md)
- 使用手册（含证据区/导出 Excel）：[docs/manual.md](docs/manual.md)
- 工作流程：[docs/workflow.md](docs/workflow.md)
- 配置说明（为什么需要 config.xlsx）：[docs/config.md](docs/config.md)
- 大模型配置（DeepSeek 示例）：[docs/config/llm.md](docs/config/llm.md)
- 交付与部署（Docker/二进制/自启动）：[docs/executable.md](docs/executable.md)

## 定位

auto-QA 用于对项目交付物（文档/代码/表格等）执行可配置的质量检查：将规则（Excel）解析为提示词（prompt），对导入目录中的文件进行逐条规则扫描，输出不符合项、修改建议与可复核的证据摘录。

## 价值

- 统一检查标准：规则集中管理，扫描口径一致
- 提升效率：批量扫描、快速定位不符合项
- 便于复核：每条不符合项提供“证据区”（文件 + 摘录）
- 可落盘：规则与配置写入 `work/`，便于留痕与复用

## 大模型配置

大模型配置从 `scripts/config.yaml` 读取（示例见 `scripts/config.example.yaml`）。

- 详细说明：docs/config/llm.md

## 快速上手

1) 配置大模型

```bash
cp scripts/config.example.yaml scripts/config.yaml
```

在 `scripts/config.yaml` 中填写 `llm.api_key`。

2) 启动后端

```bash
python3 scripts/autoqa_scan.py --serve --host 0.0.0.0 --port 8000 --config scripts/config.yaml
```

3) 启动前端

```bash
cd autoqa-ui
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

4) 使用流程

- 准备目录结构：docs/structure.md
- 规则导入/扫描/导出：docs/manual.md
