import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import demoDataset from "../data/processed/demo-dataset.json" with { type: "json" };
import { validateOwl2Artifacts, type DemoDataset } from "../shared/ontology-service";
import { buildOwlModules } from "./generate-owl-modules";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const generatedDir = path.join(root, "ontology", "generated");
const dataset = demoDataset as unknown as DemoDataset;
const validation = validateOwl2Artifacts(dataset);
const modules = buildOwlModules();

await fs.mkdir(generatedDir, { recursive: true });
await Promise.all(Object.entries(modules).map(([file, content]) => fs.writeFile(path.join(root, "ontology", file), content, "utf8")));
await fs.writeFile(path.join(generatedDir, "validation-report.json"), `${JSON.stringify(validation, null, 2)}\n`, "utf8");

if (!validation.success) {
  console.error(validation.errors.map((item) => `${item.code}: ${item.message}`).join("\n"));
  process.exit(1);
}

console.log(`OWL2 validation passed: ${validation.metrics.classes} classes, ${validation.metrics.objectProperties} object properties, ${validation.metrics.rules} rules.`);
