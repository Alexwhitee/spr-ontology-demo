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

console.log(`Validated dataset: ${parsed.records.length} records, ${parsed.ontology.nodes.length} nodes, ${parsed.fieldMappings.length} mappings.`);
