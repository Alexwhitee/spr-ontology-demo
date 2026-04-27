export type GraphNodeType = "class" | "instance" | "property" | "rule" | "field";
export type GraphGroup = "top" | "spr-core" | "spr-extension" | "data" | "reasoning";
export type GraphEdgeType = "inherits" | "objectProperty" | "dataProperty" | "mapsTo" | "derivedFrom";

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
  ontology: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  fieldMappings: FieldMapping[];
  records: ProcessRecord[];
  demoScripts: Record<"3min" | "5min" | "10min", DemoScriptStep[]>;
};
