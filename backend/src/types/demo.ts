export type {
  DemoDataset,
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
};
