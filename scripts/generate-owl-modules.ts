import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TOP_ONTOLOGY_MODULES,
  exportTopOntologyOwlXml,
  listOntologyClasses,
  listOntologyProperties,
  listQualityRules,
  type OntologyModuleName
} from "../shared/ontology-service";

export const ONTOLOGY_MODULES: OntologyModuleName[] = ["core.owl", "process.owl", "resource.owl", "quality.owl", "model.owl", "spr.owl"];
export { TOP_ONTOLOGY_MODULES };

type OwlModuleMap = Record<string, string>;

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ontologyDir = path.join(root, "ontology");

export function buildOwlModules(): OwlModuleMap {
  const modules = Object.fromEntries(ONTOLOGY_MODULES.map((moduleName) => [
    moduleName,
    buildModuleOwl(moduleName)
  ]));
  return {
    ...modules,
    "generated/current.owl": buildAggregateOwl(),
    "generated/top-ontology.owl": exportTopOntologyOwlXml()
  };
}

async function main() {
  const modules = buildOwlModules();
  await fs.mkdir(path.join(ontologyDir, "generated"), { recursive: true });
  await Promise.all(Object.entries(modules).map(([file, content]) => (
    fs.writeFile(path.join(ontologyDir, file), content, "utf8")
  )));
  console.log(`Generated ${Object.keys(modules).length} OWL2 files.`);
}

function buildModuleOwl(moduleName: OntologyModuleName): string {
  const classes = listOntologyClasses().filter((item) => item.module === moduleName);
  const properties = listOntologyProperties().filter((item) => item.module === moduleName);
  const rules = moduleName === "quality.owl" ? listQualityRules() : [];
  const moduleId = moduleName.replace(".owl", "");

  return xmlDocument([
    `  <owl:Ontology rdf:about="https://example.com/ontology/${moduleId}">`,
    `    <rdfs:comment>Generated OWL2 module for ${moduleName}.</rdfs:comment>`,
    "  </owl:Ontology>",
    ...classes.map((item) => classXml(item.id, item.label, item.description, item.parent)),
    ...properties.map((item) => propertyXml(item.id, item.label, item.domain, item.range, item.type)),
    ...rules.map((item) => ruleXml(item.id, item.name, item.triggerCondition))
  ].join("\n"));
}

function buildAggregateOwl(): string {
  return xmlDocument([
    "  <owl:Ontology rdf:about=\"https://example.com/ontology/spr-owl2\">",
    "    <rdfs:comment>Aggregate SPR process ontology generated from module descriptors.</rdfs:comment>",
    ...ONTOLOGY_MODULES.map((moduleName) => `    <owl:imports rdf:resource="../${moduleName}"/>`),
    "  </owl:Ontology>"
  ].join("\n"));
}

function xmlDocument(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"\n         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"\n         xmlns:owl="http://www.w3.org/2002/07/owl#"\n         xmlns:xsd="http://www.w3.org/2001/XMLSchema#">\n${body}\n</rdf:RDF>\n`;
}

function classXml(id: string, label: string, description: string, parent?: string): string {
  const parentXml = parent ? `\n    <rdfs:subClassOf rdf:resource="#${escapeXml(parent)}"/>` : "";
  return `  <owl:Class rdf:about="#${escapeXml(id)}">${parentXml}\n    <rdfs:label>${escapeXml(label)}</rdfs:label>\n    <rdfs:comment>${escapeXml(description)}</rdfs:comment>\n  </owl:Class>`;
}

function propertyXml(id: string, label: string, domain: string, rangeValue: string, type: "object" | "data"): string {
  const tag = type === "object" ? "owl:ObjectProperty" : "owl:DatatypeProperty";
  const range = rangeValue.startsWith("xsd:") ? rangeValue : `#${rangeValue}`;
  return `  <${tag} rdf:about="#${escapeXml(id)}">\n    <rdfs:label>${escapeXml(label)}</rdfs:label>\n    <rdfs:domain rdf:resource="#${escapeXml(domain)}"/>\n    <rdfs:range rdf:resource="${escapeXml(range)}"/>\n  </${tag}>`;
}

function ruleXml(id: string, name: string, triggerCondition: string): string {
  return `  <owl:NamedIndividual rdf:about="#${escapeXml(id)}">\n    <rdf:type rdf:resource="#QualityRule"/>\n    <rdfs:label>${escapeXml(name)}</rdfs:label>\n    <rdfs:comment>${escapeXml(triggerCondition)}</rdfs:comment>\n  </owl:NamedIndividual>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
