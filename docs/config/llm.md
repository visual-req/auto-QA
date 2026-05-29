# LLM Config

配置文件路径：`scripts/config.yaml`（示例：`scripts/config.example.yaml`）。

## 为什么需要配置

扫描阶段会把每条规则的提示词（prompt）与候选文件内容一起交给大模型做语义判断，并要求返回“结论/原因/修改建议/证据”。因此必须配置可用的 LLM 接口（base_url / model / api_key）。

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

1. 在 DeepSeek 官方平台完成注册与登录
2. 进入 API/密钥管理页面创建 API Key
3. 确保账号已开通/具备可用额度（如需充值或绑定支付方式，以平台要求为准）
4. 将 API Key 填入 `scripts/config.yaml` 的 `llm.api_key`
5. 将 `llm.base_url` 设置为 `https://api.deepseek.com`（或 `https://api.deepseek.com/v1`），并将 `llm.model` 设置为 DeepSeek 提供的模型名（例如 `deepseek-chat` / `deepseek-reasoner` 或文档中最新推荐的模型名）【来源：https://api-docs.deepseek.com/】

注意：

- 不要把 API Key 提交到代码仓库
- 如果遇到 401/403/429 等错误，优先检查 Key 是否有效、额度是否充足、以及 base_url/model 是否与平台要求一致

服务健康检查：

- `GET /api/llm/health` 返回 `configured/baseUrl/model/source/configPath`
