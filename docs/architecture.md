# SPR Demo 架构说明

## 架构选择

Demo 采用“静态预处理数据 + React 前端 + Cloudflare Worker API”的结构。当前数据规模较小，不引入 Neo4j、RDF Store 或完整 OWL 推理器。

```mermaid
flowchart LR
  A["Markdown / Excel 原始材料"] --> B["scripts/build-demo-dataset.ts"]
  B --> C["data/processed/demo-dataset.json"]
  B --> D["frontend/public/data/demo-dataset.json"]
  B --> E["frontend/public/data/curves/*.json"]
  D --> F["React + Vite 前端"]
  C --> G["Cloudflare Worker API"]
  E --> F
```

在线编辑模式在该结构上增加一层“本体覆盖层”：实例数据和曲线仍来自静态 JSON，本体 JSON 可由 Worker 从 D1 读取当前版本并覆盖静态本体部分。

```mermaid
flowchart LR
  U["上传 / 图上编辑 OntologyDocument"] --> W["Cloudflare Worker 编辑 API"]
  W --> D1["D1: 版本索引 / 当前版本 / 本体 JSON 快照"]
  D1 --> W
  W --> F["React 在线编辑页"]
```

## 数据流

1. 读取 `pmc_body_shop_prod-d7lcbg96ulq0qrl37o2g.xlsx` 和 `spr data2(1).xlsx`。
2. 标准化为 `ProcessRecord`。
3. 将长曲线字段拆到 `frontend/public/data/curves/{id}.json`。
4. 将索引、统计、本体图谱、字段映射、演示脚本写入 `demo-dataset.json`。
5. 前端默认静态加载数据；设置 `VITE_DATA_MODE=api` 后可切换 Worker API。
6. Worker 如发现云端当前本体版本，会用其覆盖 `top_ontology`、`spr_ontology`、`top_spr_mappings`、`fieldMappings`，并重新派生图谱与层级路径。

## 在线编辑界面

编辑页按语义边界拆分为四个模式：

- 顶层工艺本体：只展示并编辑顶层类树。
- SPR 本体：只展示并编辑 SPR 类与 SPR 内部关系。
- 映射关系：单独维护 `top_spr_mappings`，即顶层类到 SPR 类的对应关系。
- 全局总览：保留完整合图，只用于检查连通性，不作为默认编辑入口。

## 关键设计

- `SPR过程记录类` 是中心对象。
- 主链路不重构：产线、设备、程序、连接点、参数、质量结果继续保留。
- v0.3 扩展层承载过程记录、曲线、包络线、公差、RRC、PECV2、模型预测结果。
- 规则解释采用轻量函数模拟，不声称完成 OWL 推理。

## OWL2 检测、规则抽取与发布链路

当前架构在静态数据和在线编辑层之上增加了一个 OWL2 语义闭环：

```mermaid
flowchart LR
  F["OWL2 工作台 / 独立业务页"] --> D["POST /api/detect/run"]
  D --> L["OpenAI-compatible LLM"]
  D --> R["POST /api/root-cause/analyze"]
  R --> W["POST /api/reports/warning"]
  F --> E["POST /api/knowledge/extract-rules"]
  E --> L
  E --> Q["D1 knowledge_rule_candidates"]
  Q --> V["PATCH review"]
  V --> P["POST /api/knowledge/publish-rules"]
  P --> O["D1 ontology_versions / ontology_current"]
  O --> X["GET /api/ontology/owl"]
```

关键约束：

- LLM 调用只由 Worker 或本地服务层读取运行时环境变量，前端不接触密钥。
- 检测模型和专家规则抽取都支持真实 LLM，失败时返回可复核的保守结果。
- 候选规则先进入 `knowledge_rule_candidates`，复核状态持久化；只有 `approved` 候选可以发布。
- 发布会新增 `spr-rule` 节点、规则到缺陷/根因的关系和顶层 `rule-top` 映射，并保存为新的 `OntologyDocument` 版本。
- OWL 导出包含静态规则和已发布规则；校验会检查 RDF/XML 根、命名空间、类/属性引用、QualityRule 个体类型和重复 IRI。
