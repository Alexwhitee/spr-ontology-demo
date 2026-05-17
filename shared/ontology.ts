import { z } from "zod";

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
  source_doc: string;
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
  source_doc: string;
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
  status?: TopOntologyStatus;
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

export type ProcessRecordSource = "main" | "rip_rop" | "new_table";

export type ProcessRecord = {
  id: string;
  source: ProcessRecordSource;
  sourceTableName?: string;
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

export type FieldMapping = {
  sourceTable: ProcessRecordSource;
  sourceTableName?: string;
  sourceField: string;
  ontologyClass: string;
  ontologyProperty: string;
  status: "已有类可承载" | "需补属性" | "需新增扩展类" | "需确认";
  note: string;
};

export type DatabaseImportRequest = {
  sourceTable: ProcessRecord["source"];
  sourceTableName?: string;
  rows: Array<Record<string, unknown>>;
};

export type DatabaseImportAutomationStep = {
  key: "records" | "fields" | "ontology" | "graph" | "flow";
  title: string;
  detail: string;
  status: "done";
};

export type DatabaseImportResult = {
  dataset: DemoDataset;
  importedRecordIds: string[];
  automationSteps: DatabaseImportAutomationStep[];
};

export type ReasoningResult = {
  recordId: string;
  conclusion: string;
  triggeredRules: string[];
  evidenceFields: string[];
  ontologyPath: string[];
  triples: Array<[string, string, string]>;
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

export type OntologyDocument = Pick<DemoDataset, "top_ontology" | "spr_ontology" | "top_spr_mappings" | "fieldMappings"> & {
  generatedAt?: string;
};

export type OntologyArtifacts = Pick<DemoDataset, "top_ontology" | "spr_ontology" | "top_spr_mappings" | "hierarchy_paths" | "ontology" | "fieldMappings">;

export type OntologyValidationResult = {
  success: boolean;
  errors: string[];
  document?: OntologyDocument;
};

export type OntologyOperation =
  | { type: "addNode"; kind: "top"; node: TopOntologyNode }
  | { type: "addNode"; kind: "spr"; node: SprOntologyNode }
  | { type: "updateNode"; id: string; patch: Partial<TopOntologyNode> | Partial<SprOntologyNode> }
  | { type: "deleteNode"; id: string; cascade?: boolean }
  | { type: "addEdge"; edge: SprOntologyRelation }
  | { type: "updateEdge"; id: string; patch: Partial<SprOntologyRelation> }
  | { type: "deleteEdge"; id: string }
  | { type: "upsertMapping"; mapping: TopSprMapping }
  | { type: "deleteMapping"; id: string };

const ontologyPropertySchema = z.object({
  name: z.string().min(1),
  description: z.string()
});

const topOntologyNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  parent_id: z.string().min(1).nullable(),
  children: z.array(z.string()),
  definition: z.string(),
  properties: z.array(ontologyPropertySchema),
  source_doc: z.string(),
  status: z.enum(["stable", "candidate"])
});

const sprOntologyNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  layer: z.enum(["spr-core", "spr-extension", "spr-rule", "spr-data"]),
  parent_top_id: z.string().min(1),
  inheritance_relation: z.enum(["subclass-of", "instance-of", "candidate-subclass-of"]),
  definition: z.string(),
  source_fields: z.array(z.string()),
  properties: z.array(ontologyPropertySchema),
  relations: z.array(z.string()),
  source_doc: z.string(),
  instanceCount: z.number().optional()
});

const sprOntologyRelationSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["inherits", "objectProperty", "dataProperty", "mapsTo", "derivedFrom", "subclass-of"])
});

const topSprMappingSchema = z.object({
  id: z.string().min(1),
  top_id: z.string().min(1),
  spr_id: z.string().min(1),
  relation: z.enum(["subclass-of", "belongs-to", "candidate-extension"]),
  evidence: z.string(),
  source_section: z.string()
});

const sourceTableSchema = z.enum(["main", "rip_rop", "new_table"]);

const fieldMappingSchema = z.object({
  sourceTable: sourceTableSchema,
  sourceTableName: z.string().min(1).optional(),
  sourceField: z.string().min(1),
  ontologyClass: z.string().min(1),
  ontologyProperty: z.string().min(1),
  status: z.enum(["已有类可承载", "需补属性", "需新增扩展类", "需确认"]),
  note: z.string()
});

const ontologyDocumentSchema = z.object({
  generatedAt: z.string().optional(),
  top_ontology: z.object({
    root_ids: z.array(z.string()),
    nodes: z.record(z.string(), topOntologyNodeSchema)
  }),
  spr_ontology: z.object({
    nodes: z.record(z.string(), sprOntologyNodeSchema),
    relations: z.array(sprOntologyRelationSchema)
  }),
  top_spr_mappings: z.array(topSprMappingSchema),
  fieldMappings: z.array(fieldMappingSchema)
});

export function createOntologyDocumentFromDataset(dataset: DemoDataset): OntologyDocument {
  return normalizeOntologyDocument({
    generatedAt: dataset.generatedAt,
    top_ontology: dataset.top_ontology,
    spr_ontology: dataset.spr_ontology,
    top_spr_mappings: dataset.top_spr_mappings,
    fieldMappings: dataset.fieldMappings
  });
}

export function mergeDatasetWithOntology(dataset: DemoDataset, document: OntologyDocument): DemoDataset {
  const artifacts = deriveOntologyArtifacts(document);
  return {
    ...dataset,
    generatedAt: document.generatedAt ?? dataset.generatedAt,
    ...artifacts
  };
}

export function importDatabaseRows(dataset: DemoDataset, request: DatabaseImportRequest): DatabaseImportResult {
  const importedRecords = request.rows.map((row, index) => normalizeImportedRecord(request.sourceTable, row, index, request.sourceTableName));
  const existingRecords = new Map(dataset.records.map((record) => [record.id, clone(record)]));
  for (const record of importedRecords) existingRecords.set(record.id, record);

  const records = Array.from(existingRecords.values());
  const fieldMappings = mergeFieldMappings(dataset.fieldMappings, request);
  const summary = rebuildSummary(dataset.summary, records, fieldMappings);
  const document = createOntologyDocumentFromDataset({
    ...dataset,
    records,
    summary,
    fieldMappings
  });
  refreshInstanceCounts(document, records);
  const artifacts = deriveOntologyArtifacts(document);
  const nextDataset: DemoDataset = {
    ...dataset,
    generatedAt: document.generatedAt ?? new Date().toISOString(),
    summary,
    records,
    ...artifacts
  };

  return {
    dataset: nextDataset,
    importedRecordIds: importedRecords.map((record) => record.id),
    automationSteps: buildDatabaseImportSteps(request, importedRecords, nextDataset)
  };
}

export function validateOntologyDocument(value: unknown): OntologyValidationResult {
  const parsed = ontologyDocumentSchema.safeParse(value);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    };
  }

  const document = normalizeOntologyDocument(parsed.data);
  const errors: string[] = [];
  const topIds = Object.keys(document.top_ontology.nodes);
  const sprIds = Object.keys(document.spr_ontology.nodes);
  const allNodeIds = new Set<string>();

  for (const id of [...topIds, ...sprIds]) {
    if (allNodeIds.has(id)) errors.push(`节点 ID 重复：${id}`);
    allNodeIds.add(id);
  }

  for (const [id, node] of Object.entries(document.top_ontology.nodes)) {
    if (node.parent_id && !document.top_ontology.nodes[node.parent_id]) errors.push(`顶层节点 ${id} 的父节点不存在：${node.parent_id}`);
    if (node.parent_id === id) errors.push(`顶层节点 ${id} 不能引用自己作为父节点`);
  }

  for (const [id, node] of Object.entries(document.spr_ontology.nodes)) {
    if (!document.top_ontology.nodes[node.parent_top_id]) errors.push(`SPR 节点 ${id} 的 parent_top_id 不存在：${node.parent_top_id}`);
  }

  assertUnique(document.spr_ontology.relations.map((relation) => relation.id), "SPR 关系 ID 重复", errors);
  for (const relation of document.spr_ontology.relations) {
    if (!document.spr_ontology.nodes[relation.source]) errors.push(`SPR 关系 ${relation.id} 的 source 不存在：${relation.source}`);
    if (!document.spr_ontology.nodes[relation.target]) errors.push(`SPR 关系 ${relation.id} 的 target 不存在：${relation.target}`);
  }

  assertUnique(document.top_spr_mappings.map((mapping) => mapping.id), "顶层-SPR 映射 ID 重复", errors);
  for (const mapping of document.top_spr_mappings) {
    if (!document.top_ontology.nodes[mapping.top_id]) errors.push(`映射 ${mapping.id} 的 top_id 不存在：${mapping.top_id}`);
    if (!document.spr_ontology.nodes[mapping.spr_id]) errors.push(`映射 ${mapping.id} 的 spr_id 不存在：${mapping.spr_id}`);
  }

  const cycle = findTopCycle(document.top_ontology.nodes);
  if (cycle) errors.push(`顶层父子关系存在环：${cycle.join(" -> ")}`);

  return {
    success: errors.length === 0,
    errors,
    document: errors.length === 0 ? document : undefined
  };
}

export function deriveOntologyArtifacts(value: OntologyDocument): OntologyArtifacts {
  const document = normalizeOntologyDocument(value);
  return {
    top_ontology: document.top_ontology,
    spr_ontology: document.spr_ontology,
    top_spr_mappings: document.top_spr_mappings,
    fieldMappings: document.fieldMappings,
    hierarchy_paths: buildHierarchyPaths(document.top_ontology.nodes, document.spr_ontology.nodes, document.top_spr_mappings),
    ontology: buildOntology(document.top_ontology.nodes, document.spr_ontology.nodes, document.spr_ontology.relations, document.top_spr_mappings)
  };
}

export function applyOntologyOperations(document: OntologyDocument, operations: OntologyOperation[]): OntologyDocument {
  let next = normalizeOntologyDocument(document);
  for (const operation of operations) {
    next = applyOntologyOperation(next, operation);
    const validation = validateOntologyDocument(next);
    if (!validation.success || !validation.document) throw new Error(validation.errors.join("\n"));
    next = validation.document;
  }
  return next;
}

export function normalizeOntologyDocument(document: OntologyDocument): OntologyDocument {
  const topNodes = clone(document.top_ontology.nodes);
  for (const node of Object.values(topNodes)) node.children = [];
  for (const node of Object.values(topNodes)) {
    if (node.parent_id && topNodes[node.parent_id]) topNodes[node.parent_id].children.push(node.id);
  }

  const relations = clone(document.spr_ontology.relations);
  const sprNodes = clone(document.spr_ontology.nodes);
  for (const node of Object.values(sprNodes)) node.relations = [];
  for (const relation of relations) {
    sprNodes[relation.source]?.relations.push(relation.id);
    sprNodes[relation.target]?.relations.push(relation.id);
  }

  return {
    generatedAt: document.generatedAt,
    top_ontology: {
      root_ids: Object.values(topNodes).filter((node) => node.parent_id === null).map((node) => node.id),
      nodes: topNodes
    },
    spr_ontology: {
      nodes: sprNodes,
      relations
    },
    top_spr_mappings: clone(document.top_spr_mappings),
    fieldMappings: clone(document.fieldMappings)
  };
}

function applyOntologyOperation(document: OntologyDocument, operation: OntologyOperation): OntologyDocument {
  const next = normalizeOntologyDocument(document);
  if (operation.type === "addNode") {
    if (next.top_ontology.nodes[operation.node.id] || next.spr_ontology.nodes[operation.node.id]) throw new Error(`节点已存在：${operation.node.id}`);
    if (operation.kind === "top") next.top_ontology.nodes[operation.node.id] = operation.node;
    else next.spr_ontology.nodes[operation.node.id] = operation.node;
  }
  if (operation.type === "updateNode") {
    if (next.top_ontology.nodes[operation.id]) next.top_ontology.nodes[operation.id] = { ...next.top_ontology.nodes[operation.id], ...operation.patch } as TopOntologyNode;
    else if (next.spr_ontology.nodes[operation.id]) next.spr_ontology.nodes[operation.id] = { ...next.spr_ontology.nodes[operation.id], ...operation.patch } as SprOntologyNode;
    else throw new Error(`节点不存在：${operation.id}`);
  }
  if (operation.type === "deleteNode") deleteNode(next, operation.id, Boolean(operation.cascade));
  if (operation.type === "addEdge") {
    if (next.spr_ontology.relations.some((relation) => relation.id === operation.edge.id)) throw new Error(`关系已存在：${operation.edge.id}`);
    next.spr_ontology.relations.push(operation.edge);
  }
  if (operation.type === "updateEdge") {
    const index = next.spr_ontology.relations.findIndex((relation) => relation.id === operation.id);
    if (index < 0) throw new Error(`关系不存在：${operation.id}`);
    next.spr_ontology.relations[index] = { ...next.spr_ontology.relations[index], ...operation.patch };
  }
  if (operation.type === "deleteEdge") {
    next.spr_ontology.relations = next.spr_ontology.relations.filter((relation) => relation.id !== operation.id);
  }
  if (operation.type === "upsertMapping") {
    next.top_spr_mappings = [...next.top_spr_mappings.filter((mapping) => mapping.id !== operation.mapping.id), operation.mapping];
  }
  if (operation.type === "deleteMapping") {
    next.top_spr_mappings = next.top_spr_mappings.filter((mapping) => mapping.id !== operation.id);
  }
  return normalizeOntologyDocument(next);
}

function deleteNode(document: OntologyDocument, id: string, cascade: boolean) {
  if (document.spr_ontology.nodes[id]) {
    const hasRelations = document.spr_ontology.relations.some((relation) => relation.source === id || relation.target === id);
    const hasMappings = document.top_spr_mappings.some((mapping) => mapping.spr_id === id);
    if (!cascade && (hasRelations || hasMappings)) throw new Error(`节点 ${id} 仍有关联关系，请使用级联删除`);
    delete document.spr_ontology.nodes[id];
    document.spr_ontology.relations = document.spr_ontology.relations.filter((relation) => relation.source !== id && relation.target !== id);
    document.top_spr_mappings = document.top_spr_mappings.filter((mapping) => mapping.spr_id !== id);
    return;
  }

  if (document.top_ontology.nodes[id]) {
    const ids = collectTopDescendants(document.top_ontology.nodes, id);
    const hasSprChildren = Object.values(document.spr_ontology.nodes).some((node) => ids.has(node.parent_top_id));
    const hasMappings = document.top_spr_mappings.some((mapping) => ids.has(mapping.top_id));
    if (!cascade && (ids.size > 1 || hasSprChildren || hasMappings)) throw new Error(`节点 ${id} 仍有关联关系，请使用级联删除`);
    for (const targetId of ids) delete document.top_ontology.nodes[targetId];
    document.top_spr_mappings = document.top_spr_mappings.filter((mapping) => !ids.has(mapping.top_id));
    for (const [sprId, node] of Object.entries(document.spr_ontology.nodes)) {
      if (ids.has(node.parent_top_id)) deleteNode(document, sprId, true);
    }
    return;
  }

  throw new Error(`节点不存在：${id}`);
}

function buildHierarchyPaths(topNodes: Record<string, TopOntologyNode>, sprNodes: Record<string, SprOntologyNode>, mappings: TopSprMapping[]): HierarchyPath[] {
  return mappings.map((item) => ({
    id: `path-${item.id}`,
    top_path: ancestorPath(item.top_id, topNodes),
    spr_path: sprNodes[item.spr_id]?.relations.length ? [item.spr_id, ...sprNodes[item.spr_id].relations.slice(0, 4)] : [item.spr_id],
    mapping_id: item.id
  }));
}

function buildOntology(topNodes: Record<string, TopOntologyNode>, sprNodes: Record<string, SprOntologyNode>, relations: SprOntologyRelation[], mappings: TopSprMapping[]): DemoDataset["ontology"] {
  const nodes: GraphNode[] = [
    ...Object.values(topNodes).map((item) => ({
      id: item.id,
      label: item.name,
      type: "class" as const,
      group: "top" as const,
      description: item.definition,
      instanceCount: mappings.filter((mapping) => mapping.top_id === item.id).length,
      status: item.status
    })),
    ...Object.values(sprNodes).map((item) => ({
      id: item.id,
      label: item.name,
      type: item.layer === "spr-rule" ? "rule" as const : "class" as const,
      group: item.layer === "spr-core" ? "spr-core" as const : item.layer === "spr-rule" ? "reasoning" as const : "spr-extension" as const,
      description: item.definition,
      sourceFields: item.source_fields,
      instanceCount: item.instanceCount
    }))
  ];

  const topEdges = Object.values(topNodes)
    .filter((item) => item.parent_id)
    .map((item) => edge(`top-${item.parent_id}-${item.id}`, item.parent_id as string, item.id, "subclass-of", "inherits"));
  const sprEdges = relations.map((item) => edge(item.id, item.source, item.target, item.label, item.type === "subclass-of" ? "inherits" : item.type));
  const mappingEdges = mappings
    .filter((item) => !isRedundantDisplayMapping(item, topNodes, sprNodes))
    .map((item) => edge(`mapping-${item.id}`, item.top_id, item.spr_id, item.relation, "inherits"));

  return { nodes, edges: [...topEdges, ...sprEdges, ...mappingEdges] };
}

function isRedundantDisplayMapping(item: TopSprMapping, topNodes: Record<string, TopOntologyNode>, sprNodes: Record<string, SprOntologyNode>): boolean {
  const topNode = topNodes[item.top_id];
  const sprNode = sprNodes[item.spr_id];
  return Boolean(topNode && sprNode && topNode.name === sprNode.name && item.relation === "subclass-of");
}

function ancestorPath(id: string, nodes: Record<string, TopOntologyNode>): string[] {
  const path: string[] = [];
  let current: TopOntologyNode | undefined = nodes[id];
  while (current) {
    path.unshift(current.id);
    current = current.parent_id ? nodes[current.parent_id] : undefined;
  }
  return path;
}

function edge(id: string, source: string, target: string, label: string, type: GraphEdge["type"]): GraphEdge {
  return { id, source, target, label, type };
}

function assertUnique(values: string[], label: string, errors: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) errors.push(`${label}：${value}`);
    seen.add(value);
  }
}

function collectTopDescendants(nodes: Record<string, TopOntologyNode>, id: string): Set<string> {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of Object.values(nodes)) {
      if (node.parent_id && ids.has(node.parent_id) && !ids.has(node.id)) {
        ids.add(node.id);
        changed = true;
      }
    }
  }
  return ids;
}

function findTopCycle(nodes: Record<string, TopOntologyNode>): string[] | null {
  for (const id of Object.keys(nodes)) {
    const seen = new Set<string>();
    let current: TopOntologyNode | undefined = nodes[id];
    while (current?.parent_id) {
      if (seen.has(current.id)) return [...seen, current.id];
      seen.add(current.id);
      current = nodes[current.parent_id];
    }
  }
  return null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeImportedRecord(sourceTable: ProcessRecord["source"], row: Record<string, unknown>, index: number, sourceTableName?: string): ProcessRecord {
  if (sourceTable === "rip_rop") return normalizeImportedRipRop(row, index);
  if (sourceTable === "main") return normalizeImportedMain(row, index);
  return normalizeImportedNewTable(row, index, sourceTableName);
}

function normalizeImportedMain(row: Record<string, unknown>, index: number): ProcessRecord {
  const original = parseCurve(row.original_data);
  const calculated = parseCurve(row.calculate_data);
  const id = prefixedRecordId("main", stringValue(row.id) || stringValue(row.biz_id) || `import-${index + 1}`);
  return {
    id,
    source: "main",
    lineName: stringValue(row.line_name),
    deviceName: stringValue(row.device_name),
    program: stringValue(row.prog_no),
    rivetId: stringValue(row.rivet_id),
    carBodyId: stringValue(row.carbody_id),
    timestamp: stringValue(row.origin_time) || stringValue(row.consumer_time) || stringValue(row.create_time),
    predictionCategory: stringValue(row.pre),
    errorRate: numberOrString(row.error_rate),
    raw: sanitizeImportedRow(row),
    curveSummary: {
      original: summarizeCurve(original),
      calculated: summarizeCurve(calculated)
    },
    curves: {
      original,
      calculated
    }
  };
}

function normalizeImportedRipRop(row: Record<string, unknown>, index: number): ProcessRecord {
  const riveting = parseCurve(row["铆接曲线"]);
  const envelope = parseCurve(row["包络线"]);
  const id = prefixedRecordId("riprop", stringValue(row["实物编号"]) || stringValue(row.id) || `import-${index + 1}`);
  return {
    id,
    source: "rip_rop",
    lineName: "RIP_ROP",
    deviceName: stringValue(row.Devicename),
    program: stringValue(row["程序"]),
    rivetId: stringValue(row["铆钉计数器"]),
    carBodyId: stringValue(row["车身标识"]),
    timestamp: stringValue(row["日期/时间"]),
    faultCode: stringValue(row["故障代码"]),
    raw: sanitizeImportedRow(row),
    curveSummary: {
      riveting: summarizeCurve(riveting),
      envelope: summarizeCurve(envelope)
    },
    curves: {
      riveting,
      envelope
    }
  };
}

function normalizeImportedNewTable(row: Record<string, unknown>, index: number, sourceTableName?: string): ProcessRecord {
  const tableName = sanitizeSourceTableName(sourceTableName);
  const idValue = firstStringValue(row, ["id", "ID", "Id", "inspection_id", "record_id", "biz_id"]) ?? `import-${index + 1}`;
  return {
    id: prefixedRecordId(`table-${slugifyIdentifier(tableName)}`, idValue),
    source: "new_table",
    sourceTableName: tableName,
    lineName: stringValue(row.line_name) || stringValue(row["产线"]),
    deviceName: stringValue(row.device_name) || stringValue(row.Devicename) || stringValue(row["设备"]),
    program: stringValue(row.prog_no) || stringValue(row["程序"]),
    rivetId: stringValue(row.rivet_id) || stringValue(row["铆钉计数器"]),
    carBodyId: stringValue(row.carbody_id) || stringValue(row["车身标识"]),
    timestamp: stringValue(row.origin_time) || stringValue(row.create_time) || stringValue(row["日期/时间"]) || stringValue(row.timestamp),
    raw: sanitizeImportedRow(row)
  };
}

function prefixedRecordId(prefix: string, value: string): string {
  const normalized = slugifyIdentifier(value);
  if (normalized.startsWith(`${prefix}-`)) return normalized;
  return `${prefix}-${normalized}`;
}

function mergeFieldMappings(existing: FieldMapping[], request: DatabaseImportRequest): FieldMapping[] {
  const merged = [...existing];
  const requestTableName = request.sourceTable === "new_table" ? sanitizeSourceTableName(request.sourceTableName) : undefined;
  const known = new Set(merged
    .filter((item) => item.sourceTable === request.sourceTable && (request.sourceTable !== "new_table" || item.sourceTableName === requestTableName))
    .map((item) => item.sourceField));
  for (const row of request.rows) {
    for (const sourceField of Object.keys(row)) {
      if (known.has(sourceField)) continue;
      known.add(sourceField);
      merged.push({
        sourceTable: request.sourceTable,
        sourceTableName: requestTableName,
        sourceField,
        ontologyClass: "SPR过程记录类",
        ontologyProperty: camelizeFieldName(sourceField),
        status: "需确认",
        note: request.sourceTable === "new_table"
          ? `由新增来源表 ${requestTableName} 自动发现，已先挂接到 SPR过程记录类，等待业务确认后可细分到更准确的本体类。`
          : "由新增导入数据自动发现，已先挂接到 SPR过程记录类，等待业务确认后可细分到更准确的本体类。"
      });
    }
  }
  return merged;
}

function rebuildSummary(summary: DemoDataset["summary"], records: ProcessRecord[], fieldMappings: FieldMapping[]): DemoDataset["summary"] {
  const main = records.filter((record) => record.source === "main");
  const rip = records.filter((record) => record.source === "rip_rop");
  const newTableSourceRows = topCounts(records
    .filter((record) => record.source === "new_table")
    .map((record) => `${record.sourceTableName ?? "未命名新表"}（新增来源表）`));
  return {
    metrics: {
      ...summary.metrics,
      mainRecords: main.length,
      ripRopRecords: rip.length,
      mainFields: unique(fieldMappings.filter((mapping) => mapping.sourceTable === "main").map((mapping) => mapping.sourceField)).length,
      ripRopFields: unique(fieldMappings.filter((mapping) => mapping.sourceTable === "rip_rop").map((mapping) => mapping.sourceField)).length
    },
    distributions: {
      ...summary.distributions,
      line: topCounts(main.map((record) => record.lineName)),
      device: topCounts(main.map((record) => record.deviceName), 8),
      prediction: topCounts(main.map((record) => record.predictionCategory)),
      errorRate: topCounts(main.map((record) => String(record.errorRate ?? ""))),
      fault: topCounts(rip.map((record) => normalizeFault(record.faultCode))),
      source: [
        { name: "主数据库", value: main.length },
        { name: "RIP_ROP", value: rip.length },
        ...newTableSourceRows
      ]
    },
    conclusions: summary.conclusions
  };
}

function refreshInstanceCounts(document: OntologyDocument, records: ProcessRecord[]): void {
  const counts: Record<string, number> = {
    record: records.length,
    line: unique(records.map((record) => record.lineName)).length,
    device: unique(records.map((record) => record.deviceName)).length,
    program: unique(records.map((record) => record.program)).length,
    joint: unique(records.map((record) => record.rivetId)).length
  };
  for (const [id, count] of Object.entries(counts)) {
    if (document.spr_ontology.nodes[id]) document.spr_ontology.nodes[id].instanceCount = count;
  }
  document.generatedAt = new Date().toISOString();
}

function buildDatabaseImportSteps(request: DatabaseImportRequest, records: ProcessRecord[], dataset: DemoDataset): DatabaseImportAutomationStep[] {
  const fields = unique(request.rows.flatMap((row) => Object.keys(row)));
  const sourceLabel = importSourceLabel(request);
  return [
    {
      key: "records",
      title: "记录导入",
      detail: `已把 ${records.length} 条 ${sourceLabel} 数据标准化为 ProcessRecord。`,
      status: "done"
    },
    {
      key: "fields",
      title: "字段识别",
      detail: `识别 ${fields.length} 个字段；新增字段会自动补入字段映射并标记为“需确认”。`,
      status: "done"
    },
    {
      key: "ontology",
      title: "本体刷新",
      detail: `已刷新 SPR过程记录类实例数为 ${dataset.spr_ontology.nodes.record?.instanceCount ?? dataset.records.length}，并同步字段映射。`,
      status: "done"
    },
    {
      key: "graph",
      title: "图谱重建",
      detail: `已重新派生 ${dataset.ontology.nodes.length} 个图节点和 ${dataset.ontology.edges.length} 条图关系。`,
      status: "done"
    },
    {
      key: "flow",
      title: "检测链路可用",
      detail: `新记录 ${records.map((record) => record.id).join("、")} 已可进入检测、根因和预警流程。`,
      status: "done"
    }
  ];
}

function parseCurve(value: unknown): number[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((item) => Number.isFinite(item));
}

function summarizeCurve(points: number[]): CurveSummary {
  if (points.length === 0) return { pointCount: 0, min: 0, max: 0, avg: 0, peakIndex: -1 };
  let min = points[0];
  let max = points[0];
  let peakIndex = 0;
  let sum = 0;
  points.forEach((point, index) => {
    if (point < min) min = point;
    if (point > max) {
      max = point;
      peakIndex = index;
    }
    sum += point;
  });
  return {
    pointCount: points.length,
    min: round(min),
    max: round(max),
    avg: round(sum / points.length),
    peakIndex
  };
}

function sanitizeImportedRow(row: Record<string, unknown>): ProcessRecord["raw"] {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (value instanceof Date) return [key, value.toISOString()];
    if (typeof value === "string" && value.length > 160) {
      const pointCount = value.split(",").filter((part) => part.trim()).length;
      return [key, `[长序列字段，${pointCount} 个点，详情按需加载]`];
    }
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [key, value];
    if (value === undefined) return [key, null];
    return [key, String(value)];
  }));
}

function stringValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  return text.trim().length > 0 ? text : undefined;
}

function numberOrString(value: unknown): number | string | undefined {
  if (value === null || value === undefined) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : String(value);
}

function firstStringValue(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringValue(row[key]);
    if (value) return value;
  }
  return undefined;
}

function sanitizeSourceTableName(value: string | undefined): string {
  const text = value?.trim();
  return text ? text : "未命名新表";
}

function slugifyIdentifier(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/_+/g, "-")
    .toLowerCase();
  return ascii || "new-table";
}

function importSourceLabel(request: DatabaseImportRequest): string {
  if (request.sourceTable === "rip_rop") return "RIP_ROP";
  if (request.sourceTable === "main") return "主数据库";
  return `${sanitizeSourceTableName(request.sourceTableName)}（新增来源表）`;
}

function topCounts(values: Array<string | undefined>, limit = 10): Array<{ name: string; value: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value && value.trim() ? value : "未提供";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function normalizeFault(value: string | undefined): string {
  if (!value || value === "-") return "正常或未标记";
  return value.replace(/^DDC:\s*/, "");
}

function camelizeFieldName(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const parts = ascii.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "importedField";
  const [first, ...rest] = parts;
  return [first.toLowerCase(), ...rest.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)].join("");
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
