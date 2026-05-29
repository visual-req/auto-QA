# Getting Started

## 1) 配置大模型

复制并编辑配置文件：

```bash
cp scripts/config.example.yaml scripts/config.yaml
```

在 `scripts/config.yaml` 里填写 `llm.api_key`。

## 2) 启动后端

```bash
python3 scripts/autoqa_scan.py --serve --host 0.0.0.0 --port 8000 --config scripts/config.yaml
```

## 3) 准备目录结构

在“选择目录”时，推荐选择 `work/inputs`，并按项目拆分目录：

- 结构说明：docs/structure.md

## 4) 准备规则与配置（Excel 格式）

### 规则 Excel（rules.xlsx）

在 UI 的“规则”页上传规则 Excel。系统会尽量按表头自动识别字段，建议至少包含：

- 规则名（name）
- 规则详细/检查要点（pattern 或 checkpoint）
- 严重性（severity，可选，默认中）
- 检查对象（scope：content/file，可选，默认 content）
- 适用后缀（extensions，可选）
- 阶段（stage，可选）

支持多 Sheet：每个 Sheet 可视为一个阶段分组（若规则行未填写 stage，会尝试使用 Sheet 名作为阶段）。

### 配置 Excel（config.xlsx）

在 UI 的“配置”页上传配置 Excel，用于“按项目启用哪些检查项”。

建议结构：

- Sheet 名：阶段名（例如 00_立项、01_计划…）
- 第一列：项目/系统标识（项目编号或项目名，需与导入目录中的项目标识一致）
- 其余列：检查项（与规则中的“检查要点/检查项/规则名”之一匹配），单元格用“是/√/1/true”等表示启用

## 5) 启动前端

```bash
cd autoqa-ui
npm run dev -- --host 0.0.0.0 --port 5173
```
