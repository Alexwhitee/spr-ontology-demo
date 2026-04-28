# SPR Demo 数据契约

## ProcessRecord

```ts
type ProcessRecord = {
  id: string;
  source: "main" | "rip_rop";
  lineName?: string;
  deviceName?: string;
  program?: string;
  rivetId?: string;
  carBodyId?: string;
  timestamp?: string;
  faultCode?: string;
  predictionCategory?: string;
  errorRate?: number | string;
  raw: Record<string, string | number | boolean | null>;
  curveSummary?: {
    original?: CurveSummary;
    calculated?: CurveSummary;
    riveting?: CurveSummary;
    envelope?: CurveSummary;
  };
};
```

## 曲线文件

每条记录的曲线详情按需加载：

```text
frontend/public/data/curves/{recordId}.json
```

结构：

```ts
type CurveDetail = {
  id: string;
  curves: {
    original?: number[];
    calculated?: number[];
    riveting?: number[];
    envelope?: number[];
  };
  curveSummary: Record<string, CurveSummary>;
};
```

## 字段映射状态

- `已有类可承载`：映射到原 SPR 主链路中的已有类。
- `需补属性`：已有类可承载，但需要新增数据属性。
- `需新增扩展类`：需要 v0.3 新增类承载。
- `需确认`：业务含义未确认，Demo 保守展示。

## OntologyDocument

在线编辑器上传和保存的规范本体 JSON 使用 `OntologyDocument`，只保存人工维护部分：

```ts
type OntologyDocument = {
  generatedAt?: string;
  top_ontology: DemoDataset["top_ontology"];
  spr_ontology: DemoDataset["spr_ontology"];
  top_spr_mappings: DemoDataset["top_spr_mappings"];
  fieldMappings: DemoDataset["fieldMappings"];
};
```

系统会从该文档派生：

- `ontology.nodes / ontology.edges`：图谱渲染用节点与边。
- `hierarchy_paths`：顶层类到 SPR 类的追溯路径。
- `children / root_ids / relations`：根据父子关系和边自动归一化。

校验规则：

- 顶层节点与 SPR 节点 ID 全局唯一。
- 顶层父节点必须存在，且不能形成父子环。
- SPR 节点 `parent_top_id` 必须引用有效顶层节点。
- SPR 关系 `source / target` 必须引用有效 SPR 节点。
- 顶层-SPR 映射 `top_id / spr_id` 必须引用有效节点。

## 在线编辑操作

Worker 接收的增量操作类型：

```ts
type OntologyOperation =
  | { type: "addNode"; kind: "top" | "spr"; node: TopOntologyNode | SprOntologyNode }
  | { type: "updateNode"; id: string; patch: Partial<TopOntologyNode | SprOntologyNode> }
  | { type: "deleteNode"; id: string; cascade?: boolean }
  | { type: "addEdge"; edge: SprOntologyRelation }
  | { type: "updateEdge"; id: string; patch: Partial<SprOntologyRelation> }
  | { type: "deleteEdge"; id: string }
  | { type: "upsertMapping"; mapping: TopSprMapping }
  | { type: "deleteMapping"; id: string };
```

删除节点默认禁止留下悬空关系；编辑器使用 `cascade: true` 时会同步删除相关 SPR 关系、顶层-SPR 映射和子节点引用。
