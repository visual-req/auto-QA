# LLM Config

配置文件路径：`scripts/config.yaml`（示例：`scripts/config.example.yaml`）。

## 为什么需要配置

扫描阶段会把每条规则的提示词（prompt）与候选文件内容一起交给大模型做语义判断，并要求返回“结论/原因/修改建议/证据”。因此必须配置可用的 LLM 接口（base_url / model / api_key）。

## 为什么需要申请 LLM API Key

LLM 平台通常不会向匿名用户开放调用接口，必须通过 API Key 进行认证与计费。申请/配置 API Key 的目的主要包括：

- 身份认证：平台用 Key 识别你的账号与权限，决定能否调用指定模型。
- 额度与计费：每次调用会消耗额度/产生费用，Key 用于归属与结算。
- 限流与稳定性：平台会基于 Key 做并发/频率控制，保护系统稳定。
- 安全与追溯：Key 可单独吊销/轮换，支持审计与追踪调用来源。

在本系统中，规则扫描会批量调用 LLM，且请求中可能包含项目文档内容摘录，因此务必使用你自己的 Key，并按安全规范管理。

```yaml
llm:
  base_url: "https://api.openai.com/v1"
  model: "gpt-4o-mini"
  timeout: 60
  api_key: ""
```

字段说明：

- `llm.api_key`：必填，API Key
- `llm.base_url`：可选，兼容 OpenAI Chat Completions 接口的 Base URL
- `llm.model`：可选，模型名
- `llm.timeout`：可选，请求超时（秒）

## 以 DeepSeek 为例（申请与开通 API Key）

官方入口与说明：

- 文档与 FAQ（包含“如何获取 API Key”）：https://deepseek.ai/docs （FAQ 提到在 platform.deepseek.com 的 API Keys 页面创建密钥）【来源：https://deepseek.ai/docs】
- API Quick Start（base_url 与 api_key 申请入口）：https://api-docs.deepseek.com/ （表格给出 base_url=https://api.deepseek.com，api_key 在 platform.deepseek.com/api_keys 申请）【来源：https://api-docs.deepseek.com/】

步骤（推荐按官方平台操作）：

1. 注册/登录
   - 打开 DeepSeek 平台（platform.deepseek.com），完成注册并登录。
   - 如平台要求完成邮箱/手机号验证、实名认证等，请按页面提示完成。
2. 准备可用额度
   - 进入“账单/额度/充值”相关页面，确保账号具备可用额度或已开通计费方式。
   - 没有额度时常见现象：接口返回 402/403 或提示额度不足。
3. 创建 API Key
   - 进入 “API Keys / 密钥管理” 页面（通常是 platform.deepseek.com/api_keys）。
   - 点击创建（Create new key / 新建密钥），为 Key 填写用途名称（例如 auto-QA），创建后复制保存。
   - 注意：很多平台的 Key 仅在创建时展示一次，离开页面后无法再次查看原文，请及时保存到密码管理器。
4. 写入本项目配置
   - 编辑 `scripts/config.yaml`，填入：
     - `llm.api_key`: 你创建的 Key
     - `llm.base_url`: `https://api.deepseek.com`（或按官方文档要求填写 `.../v1`）
     - `llm.model`: 参考官方文档的当前可用模型名（例如 `deepseek-chat` / `deepseek-reasoner`）

注意：

- 不要把 API Key 提交到代码仓库
- 不要把 API Key 放进截图/日志/工单中；如已泄露请立刻在平台吊销并重新创建
- 如果遇到 401/403/429 等错误，优先检查 Key 是否有效、额度是否充足、以及 base_url/model 是否与平台要求一致

服务健康检查：

- `GET /api/llm/health` 返回 `configured/baseUrl/model/source/configPath`
