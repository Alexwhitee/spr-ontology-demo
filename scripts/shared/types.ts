export type GraphNodeType = "class" | "instance" | "property" | "rule" | "field";
export type GraphGroup = "top" | "spr-core" | "spr-extension" | "data" | "reasoning";
export type GraphEdgeType = "inherits" | "objectProperty" | "dataProperty" | "mapsTo" | "derivedFrom";

export type OntologyProperty = {
  name: string;
  description: string;
};

export type TopOntologyStatus = "stable" | "candidate";

export type TopOntologyNode = {
  id: string;
  name: string;
  domain: string;
  parent_id: string | null;
  children: string[];
  definition: string;
  properties: OntologyProperty[];
  source_doc: "顶层工艺本体建设方案_v0.2.md" | "顶层工艺本体补充建议.md";
  status: TopOntologyStatus;
};

export type SprOntologyLayer = "spr-core" | "spr-extension" | "spr-rule" | "spr-data";
export type InheritanceRelation = "subclass-of" | "instance-of" | "candidate-subclass-of";

export type SprOntologyNode = {
  id: string;
  name: string;
  layer: SprOntologyLayer;
  parent_top_id: string;
  inheritance_relation: InheritanceRelation;
  definition: string;
  source_fields: string[];
  properties: OntologyProperty[];
  relations: string[];
  source_doc: "SPR本体更新最终交付文档.md";
  instanceCount?: number;
};

export type SprOntologyRelation = {
  id: string;
  source: string;
  target: string;
  label: string;
  type: GraphEdgeType | "subclass-of";
};

export type TopSprMapping = {
  id: string;
  top_id: string;
  spr_id: string;
  relation: "subclass-of" | "belongs-to" | "candidate-extension";
  evidence: string;
  source_section: string;
};

export type HierarchyPath = {
  id: string;
  top_path: string[];
  spr_path: string[];
  mapping_id: string;
};

export type GraphNode = {
  id: string;
  label: string;
  type: GraphNodeType;
  group: GraphGroup;
  description?: string;
  sourceFields?: string[];
  instanceCount?: number;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  type: GraphEdgeType;
};

export type CurveSummary = {
  pointCount: number;
  min: number;
  max: number;
  avg: number;
  peakIndex: number;
};

export type ProcessRecord = {
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
  curves?: {
    original?: number[];
    calculated?: number[];
    riveting?: number[];
    envelope?: number[];
  };
};

export type ReasoningResult = {
  recordId: string;
  conclusion: string;
  triggeredRules: string[];
  evidenceFields: string[];
  ontologyPath: string[];
  triples: Array<[string, string, string]>;
};

export type FieldMapping = {
  sourceTable: "main" | "rip_rop";
  sourceField: string;
  ontologyClass: string;
  ontologyProperty: string;
  status: "已有类可承载" | "需补属性" | "需新增扩展类" | "需确认";
  note: string;
};

export type DemoScriptStep = {
  title: string;
  page: string;
  talkingPoint: string;
};

export type DemoDataset = {
  generatedAt: string;
  summary: {
    metrics: Record<string, number>;
    distributions: Record<string, Array<{ name: string; value: number }>>;
    conclusions: string[];
  };
  top_ontology: {
    root_ids: string[];
    nodes: Record<string, TopOntologyNode>;
  };
  spr_ontology: {
    nodes: Record<string, SprOntologyNode>;
    relations: SprOntologyRelation[];
  };
  top_spr_mappings: TopSprMapping[];
  hierarchy_paths: HierarchyPath[];
  ontology: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  fieldMappings: FieldMapping[];
  records: ProcessRecord[];
  demoScripts: Record<"3min" | "5min" | "10min", DemoScriptStep[]>;
};
