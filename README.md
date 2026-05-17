# 工艺本体 SPR Demo 系统

这是一个面向导师汇报的 SPR 工艺本体可视化 Demo。系统把当前项目文件夹中的 Markdown 本体材料、Excel 原始数据、字段映射和规则说明转换为可交互的知识图谱、实例追溯、曲线包络线和推理解释界面。

项目说明可从已纳入版本管理的 [docs/architecture.md](docs/architecture.md)、[docs/data-contract.md](docs/data-contract.md)、[docs/demo-script.md](docs/demo-script.md) 和 [docs/deployment.md](docs/deployment.md) 开始阅读。

## 本地运行

```bash
npm install
npm run data:build
npm run data:validate
npm run dev
```

打开 Vite 输出的本地地址，默认是 `http://localhost:5173`。

## 构建校验

```bash
npm test
npm run build
```

`npm run build` 会依次执行数据生成、数据校验、前端构建和 Worker TypeScript 检查。

## 主要能力

- 首页展示主表 666 条、RIP_ROP 177 条、字段覆盖、扩展类和关系数量。
- Cytoscape.js 展示顶层本体、SPR 主链路和 v0.3 扩展层。
- 在线编辑页支持上传规范本体 JSON、图上增删改节点/关系、保存云端版本和导出 JSON。
- 字段映射表覆盖主数据库 16 字段和 RIP_ROP 42 字段。
- 实例视图支持按产线和故障类型筛选过程记录。
- ECharts 展示原始曲线、计算后曲线、铆接曲线和包络线。
- 规则解释展示触发规则、证据字段、本体路径和 RDF-like 三元组。
- 演示脚本页提供 3 分钟、5 分钟、10 分钟汇报路径。

## 工程结构

```text
frontend/          React + Vite 前端
backend/           Cloudflare Worker API
scripts/           Excel/Markdown 到 JSON 的数据构建脚本
data/processed/    Worker 和校验使用的处理后数据
frontend/public/   前端静态数据与曲线分片
docs/              架构、部署、数据契约与演示说明
```

## Cloudflare 部署

前端部署到 Cloudflare Pages，构建命令为：

```bash
npm run build
```

构建输出目录：

```text
frontend/dist
```

Worker API 部署：

```bash
npx wrangler login
ADMIN_TOKEN="<your-admin-token>" npm run cf:setup
npm run cf:deploy:worker
```

在线编辑写接口需要先配置 D1 和 `ADMIN_TOKEN`，详见 [docs/deployment.md](docs/deployment.md)。

## OWL2 + LLM 闭环更新

本轮 OWL2 工作台已经补齐真实 Worker 链路：

- `/api/detect/run` 默认在 Worker 侧根据 `LLM_API_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 自动选择 LLM；未配置时降级到本体规则。
- `/api/knowledge/extract-rules` 支持 OpenAI-compatible Chat Completions 抽取专家文档规则候选，并在配置 D1 时写入复核队列。
- `/api/knowledge/rule-candidates`、`PATCH /api/knowledge/rule-candidates/:id/review`、`POST /api/knowledge/publish-rules` 支持候选列表、复核持久化和发布新本体版本。
- `/api/ontology/owl` 会合并已发布的 `spr-rule` 节点导出 QualityRule 个体；`npm run ontology:validate` 会执行更严格的 OWL 引用完整性校验。

LLM 环境变量只配置在运行环境或 Worker Secret 中，不要写入源码：

```env
LLM_API_BASE_URL=https://your-llm-host/v1/chat/completions
LLM_API_KEY=<set as secret>
LLM_MODEL=<openai-compatible-model>
LLM_TIMEOUT_MS=60000
```
