export type {
  DemoDataset,
  DatabaseImportRequest,
  FieldMapping,
  HierarchyPath,
  OntologyDocument,
  OntologyOperation,
  ProcessRecord,
  SprOntologyNode,
  SprOntologyRelation,
  TopOntologyNode,
  TopSprMapping
} from "../../../shared/ontology";

export type Env = {
  ALLOWED_ORIGIN?: string;
  ADMIN_TOKEN?: string;
  DATA_MODE?: string;
  DATASET_URL?: string;
  CURVE_BASE_URL?: string;
  ONTOLOGY_D1?: D1Database;
  ONTOLOGY_BUCKET?: R2Bucket;
  LLM_API_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  LLM_TIMEOUT_MS?: string;
};
