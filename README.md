# auto-QA

## 文档入口

- 文档目录：[docs/](docs/)
- 快速上手：[docs/getting-started.md](docs/getting-started.md)
- 安装指南：[docs/installation.md](docs/installation.md)
- 目录结构（inputs/rules/outputs）：[docs/structure.md](docs/structure.md)
- 使用手册（含证据区/导出 Excel）：[docs/manual.md](docs/manual.md)
- 工作流程：[docs/workflow.md](docs/workflow.md)
- 扫描过程（项目编号/缺少文件/正文解析）：[docs/scan.md](docs/scan.md)
- 企业自定义与优化（fork）：[docs/fork.md](docs/fork.md)
- 幻觉与调优（识别错误处理）：[docs/hallucination.md](docs/hallucination.md)
- 配置说明（为什么需要 config.xlsx）：[docs/config.md](docs/config.md)
- 大模型配置（DeepSeek 示例）：[docs/config/llm.md](docs/config/llm.md)
- 交付与部署（Docker/二进制/自启动）：[docs/executable.md](docs/executable.md)

## 定位

auto-QA 面向过程改进与交付质量保障场景，可作为 CMMI 中 PPQA（Process and Product Quality Assurance，过程与产品质量保证）的一部分落地工具：对项目交付物（文档/代码/表格等）执行可配置的质量检查，并提供可追溯的证据。

QA 在项目中的典型工作包括：

- 制定与维护标准：质量要求、模板/命名规范、检查清单、进入/退出准则
- 过程与产品审核：对照标准做符合性检查，发现偏差并推动闭环整改
- 交付物完整性与一致性：按阶段核对“应交付/已交付”，减少缺件与错件
- 可追溯与可复核：提供证据、记录与报告，支撑复盘与外部审计

为什么改为 AI skill 执行 QA（以规则驱动 + 大模型推理为核心）：

- 把“检查清单”结构化为规则（rules.xlsx）与项目启用关系（config.xlsx），形成可复用的能力资产
- 用大模型处理语义型检查（内容是否覆盖要点、是否存在关键描述/风险/结论等），把重复劳动自动化
- 通过“候选文件推导 + 缺少文件短路 + 正文提取 + JSON 证据输出”实现标准化执行与可追溯输出

## 价值

- 统一检查标准：规则集中管理，减少“人不同、口径不同”
- 提升效率：批量扫描 + 进度可视化，快速定位不符合项
- 强化可追溯：输出原因/建议/证据，支持复核与审计
- 降低漏检：按规则逐条覆盖，尤其对“缺少交付物/命名不规范”更敏感
- 资产化沉淀：规则/配置落盘到 `work/`，便于复用、迭代与对比

## AI 是否可以取代人类？

短期内更合理的定位是“增强型 QA”，而不是“替代 QA”：

- AI 擅长：高频、可规则化、需要一致口径的检查；以及基于文本的初步语义判断与证据提取
- 人类 QA 必不可少：定义标准与范围、处理例外与裁剪、对不确定/有风险的结论做最终判定、推动跨团队协作与闭环整改

最佳实践是：AI 负责“自动化执行与证据产出”，人类负责“标准治理与最终裁决”。

## 大模型配置

本系统在“内容检查”类规则执行时，会调用大模型 API 对候选文件正文进行语义判断，并输出结论/原因/建议/证据。因此需要配置可用的大模型接口信息。

大模型配置从 `scripts/config.yaml` 读取（示例见 `scripts/config.example.yaml`），至少需要填写 `llm.api_key`，并按你的平台设置 `llm.base_url` 与 `llm.model`。

- 详细说明与 DeepSeek 申请方式：[docs/config/llm.md](docs/config/llm.md)

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
