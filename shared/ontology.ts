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

export type FieldMapping = {
  sourceTable: "main" | "rip_rop";
  sourceField: string;
  ontologyClass: string;
  ontologyProperty: string;
  status: "已有类可承载" | "需补属性" | "需新增扩展类" | "需确认";
  note: string;
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

const fieldMappingSchema = z.object({
  sourceTable: z.enum(["main", "rip_rop"]),
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
