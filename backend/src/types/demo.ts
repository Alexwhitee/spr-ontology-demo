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

export type DemoDataset = {
  summary: {
    metrics: Record<string, number>;
    distributions: Record<string, Array<{ name: string; value: number }>>;
    conclusions: string[];
  };
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
