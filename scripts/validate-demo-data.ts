import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const datasetPath = path.join(ROOT, "data", "processed", "demo-dataset.json");

const dataset = JSON.parse(await fs.readFile(datasetPath, "utf8")) as unknown;

const schema = z.object({
  generatedAt: z.string(),
  summary: z.object({
    metrics: z.record(z.string(), z.number()),
    distributions: z.record(z.string(), z.array(z.object({ name: z.string(), value: z.number() }))),
    conclusions: z.array(z.string())
  }),
  top_ontology: z.object({
    root_ids: z.array(z.string()),
    nodes: z.record(
      z.string(),
      z.object({
        id: z.string(),
        name: z.string(),
        domain: z.string(),
        parent_id: z.string().nullable(),
        children: z.array(z.string()),
        definition: z.string(),
        properties: z.array(z.object({ name: z.string(), description: z.string() })),
        source_doc: z.string(),
        status: z.enum(["stable", "candidate"])
      })
    )
  }),
  spr_ontology: z.object({
    nodes: z.record(
      z.string(),
      z.object({
        id: z.string(),
        name: z.string(),
        layer: z.enum(["spr-core", "spr-extension", "spr-rule", "spr-data"]),
        parent_top_id: z.string(),
        inheritance_relation: z.enum(["subclass-of", "instance-of", "candidate-subclass-of"]),
        definition: z.string(),
        source_fields: z.array(z.string()),
        properties: z.array(z.object({ name: z.string(), description: z.string() })),
        relations: z.array(z.string()),
        source_doc: z.string(),
        instanceCount: z.number().optional()
      })
    ),
    relations: z.array(z.object({ id: z.string(), source: z.string(), target: z.string(), label: z.string(), type: z.string() }))
  }),
  top_spr_mappings: z.array(z.object({ id: z.string(), top_id: z.string(), spr_id: z.string(), relation: z.string(), evidence: z.string(), source_section: z.string() })),
  hierarchy_paths: z.array(z.object({ id: z.string(), top_path: z.array(z.string()), spr_path: z.array(z.string()), mapping_id: z.string() })),
  ontology: z.object({
    nodes: z.array(z.object({ id: z.string(), label: z.string(), type: z.string(), group: z.string() })),
    edges: z.array(z.object({ id: z.string(), source: z.string(), target: z.string(), label: z.string(), type: z.string() }))
  }),
  fieldMappings: z.array(z.object({ sourceTable: z.string(), sourceField: z.string(), ontologyClass: z.string(), ontologyProperty: z.string(), status: z.string(), note: z.string() })),
  records: z.array(z.object({ id: z.string(), source: z.string(), raw: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) })),
  demoScripts: z.record(z.string(), z.array(z.object({ title: z.string(), page: z.string(), talkingPoint: z.string() })))
});

const parsed = schema.parse(dataset);
const nodeIds = new Set(parsed.ontology.nodes.map((node) => node.id));
const brokenEdges = parsed.ontology.edges.filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target));

if (brokenEdges.length > 0) {
  throw new Error(`Ontology graph has broken edges: ${brokenEdges.map((edge) => edge.id).join(", ")}`);
}

const topIds = new Set(Object.keys(parsed.top_ontology.nodes));
const sprIds = new Set(Object.keys(parsed.spr_ontology.nodes));
const brokenTopParents = Object.values(parsed.top_ontology.nodes).filter((node) => node.parent_id && !topIds.has(node.parent_id));
const brokenSprParents = Object.values(parsed.spr_ontology.nodes).filter((node) => !topIds.has(node.parent_top_id));
const brokenMappings = parsed.top_spr_mappings.filter((mapping) => !topIds.has(mapping.top_id) || !sprIds.has(mapping.spr_id) || !mapping.evidence || !mapping.source_section);
const brokenSprRelations = parsed.spr_ontology.relations.filter((relation) => !sprIds.has(relation.source) || !sprIds.has(relation.target));
const unmarkedCandidateMappings = parsed.top_spr_mappings.filter((mapping) => {
  const topNode = parsed.top_ontology.nodes[mapping.top_id];
  return mapping.relation === "candidate-extension" && topNode.status !== "candidate" && !["process-window-top", "parameter-set-top", "process-data", "rule-top"].includes(mapping.top_id);
});

if (brokenTopParents.length > 0) {
  throw new Error(`Top ontology has broken parents: ${brokenTopParents.map((node) => node.id).join(", ")}`);
}
if (brokenSprParents.length > 0) {
  throw new Error(`SPR nodes missing valid parent_top_id: ${brokenSprParents.map((node) => node.id).join(", ")}`);
}
if (brokenMappings.length > 0) {
  throw new Error(`Top-SPR mappings are invalid: ${brokenMappings.map((mapping) => mapping.id).join(", ")}`);
}
if (brokenSprRelations.length > 0) {
  throw new Error(`SPR ontology relations are invalid: ${brokenSprRelations.map((relation) => relation.id).join(", ")}`);
}
if (unmarkedCandidateMappings.length > 0) {
  throw new Error(`Candidate mappings must point to candidate or approved carrier top nodes: ${unmarkedCandidateMappings.map((mapping) => mapping.id).join(", ")}`);
}
assertAcyclic(parsed.top_ontology.nodes);

const mainCount = parsed.records.filter((record) => record.source === "main").length;
const ripCount = parsed.records.filter((record) => record.source === "rip_rop").length;

if (mainCount !== parsed.summary.metrics.mainRecords) {
  throw new Error(`Main record count mismatch: ${mainCount}`);
}
if (ripCount !== parsed.summary.metrics.ripRopRecords) {
  throw new Error(`RIP_ROP record count mismatch: ${ripCount}`);
}
if (parsed.fieldMappings.length !== 58) {
  throw new Error(`Expected 58 field mappings, got ${parsed.fieldMappings.length}`);
}

console.log(`Validated dataset: ${parsed.records.length} records, ${parsed.ontology.nodes.length} graph nodes, ${Object.keys(parsed.top_ontology.nodes).length} top nodes, ${Object.keys(parsed.spr_ontology.nodes).length} SPR nodes, ${parsed.fieldMappings.length} field mappings.`);

function assertAcyclic(nodes: Record<string, { id: string; parent_id: string | null }>) {
  for (const node of Object.values(nodes)) {
    const seen = new Set<string>();
    let current: typeof node | undefined = node;
    while (current?.parent_id) {
      if (seen.has(current.id)) throw new Error(`Top ontology contains cycle at ${current.id}`);
      seen.add(current.id);
      current = nodes[current.parent_id];
    }
  }
}
