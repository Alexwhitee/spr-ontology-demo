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
};

export type TopOntologyNode = {
  id: string;
  name: string;
  domain: string;
  parent_id: string | null;
  children: string[];
  definition: string;
  source_doc: string;
  status: "stable" | "candidate";
};

export type SprOntologyNode = {
  id: string;
  name: string;
  layer: "spr-core" | "spr-extension" | "spr-rule" | "spr-data";
  parent_top_id: string;
  inheritance_relation: "subclass-of" | "instance-of" | "candidate-subclass-of";
  definition: string;
  source_fields: string[];
  relations: string[];
  source_doc: string;
  instanceCount?: number;
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

export type DemoDataset = {
  generatedAt?: string;
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
    relations: unknown[];
  };
  top_spr_mappings: TopSprMapping[];
  hierarchy_paths: HierarchyPath[];
  ontology: {
    nodes: unknown[];
    edges: unknown[];
  };
  fieldMappings: unknown[];
  records: ProcessRecord[];
  demoScripts: Record<string, unknown[]>;
};

export type Env = {
  ALLOWED_ORIGIN?: string;
  DATA_MODE?: string;
};
