# Structure

导入目录推荐选择 `work/inputs`，并按项目拆分：

```text
work/inputs/
  <projectA>/
    00_立项/
    01_计划/
    02_需求/
    03_设计/
    04_开发/
    05_测试/
    07_交付/
    08_会议纪要/
  <projectB>/
    ...
```

说明：

- `<projectA>/<projectB>` 为项目标识（可用项目编号或项目名称）
- “阶段目录”用于规则里的 stage 过滤（规则 stage 为空则不限制）

## Rules（规则目录）

规则相关文件分为两类：

1) 原始规则 Excel（用于导入）
- 在 UI 的“规则”页上传规则 Excel 后，后端会将其落盘为：`work/inputs/rules.xlsx`
- 该文件用于留存“原始输入”，便于后续复用/追溯

2) 解析后的规则 JSON（用于实际扫描）
- 规则 Excel 解析后会写入：`work/rules/rules.json`
- UI 重新打开/刷新时，会从该文件加载已解析规则（无需每次重新上传）
- 每条规则会包含模型扫描所需字段（如：stage/scope/extensions/prompt 等）

推荐目录结构：

```text
work/
  inputs/
    rules.xlsx
  rules/
    rules.json
```

字段含义（概览）：

- `stage`：阶段过滤；为空表示不限制阶段目录
- `scope`：检查对象；`content`=检查正文，`file`=检查文件名
- `extensions`：适用后缀；为空表示不限制
- `prompt`：由规则与技能模板生成的提示词，用于大模型语义判定并输出证据

## Outputs（输出目录）

系统输出主要分为两类：

1) 浏览器下载的扫描报告（Excel）
- 由前端在浏览器侧生成并下载，文件名形如：`autoqa-report-YYYY-MM-DD-HH-mm-ss.xlsx`
- 内容为当前页面筛选后的“不符合项”列表（项目/文件/规则/严重性/原因/建议）
- 默认下载到浏览器的下载目录（与操作系统/浏览器设置有关），不写入 `work/outputs`

2) 命令行运行脚本生成的报告（Excel）
- 当使用命令行模式运行 `scripts/autoqa_scan.py`（非 `--serve`）时，会写入 `--output` 指定路径
- 默认输出路径为：`work/outputs/report.xlsx`

推荐目录结构：

```text
work/
  outputs/
    report.xlsx
```

补充说明：

- `work/outputs` 用于承载“离线/命令行扫描”的落盘报告
- UI 扫描结果默认不落盘到 `work/outputs`，以避免浏览器权限与路径差异问题
