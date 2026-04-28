import demoDataset from "../data/processed/demo-dataset.json";
import { describe, expect, it } from "vitest";
import {
  applyOntologyOperations,
  createOntologyDocumentFromDataset,
  deriveOntologyArtifacts,
  type DemoDataset,
  validateOntologyDocument
} from "../shared/ontology";

const dataset = demoDataset as unknown as DemoDataset;

describe("ontology document validation and derivation", () => {
  it("accepts the generated demo ontology document and derives stable graph artifacts", () => {
    const document = createOntologyDocumentFromDataset(dataset);
    const validation = validateOntologyDocument(document);
    const artifacts = deriveOntologyArtifacts(document);

    expect(validation.success).toBe(true);
    expect(artifacts.ontology.nodes).toHaveLength(Object.keys(document.top_ontology.nodes).length + Object.keys(document.spr_ontology.nodes).length);
    expect(artifacts.ontology.edges.some((edge) => edge.id === "mapping-online-process-record-record")).toBe(true);
    expect(artifacts.hierarchy_paths.some((path) => path.mapping_id === "online-process-record-record")).toBe(true);
  });

  it("rejects SPR relations that reference missing endpoints", () => {
    const document = createOntologyDocumentFromDataset(dataset);
    document.spr_ontology.relations.push({
      id: "broken-edge",
      source: "record",
      target: "missing-node",
      label: "pointsToNowhere",
      type: "objectProperty"
    });

    const validation = validateOntologyDocument(document);

    expect(validation.success).toBe(false);
    expect(validation.errors.join("\n")).toContain("missing-node");
  });

  it("applies cascaded node deletion without leaving orphan edges or mappings", () => {
    const document = createOntologyDocumentFromDataset(dataset);
    const next = applyOntologyOperations(document, [{ type: "deleteNode", id: "record", cascade: true }]);
    const validation = validateOntologyDocument(next);

    expect(validation.success).toBe(true);
    expect(next.spr_ontology.nodes.record).toBeUndefined();
    expect(next.spr_ontology.relations.some((relation) => relation.source === "record" || relation.target === "record")).toBe(false);
    expect(next.top_spr_mappings.some((mapping) => mapping.spr_id === "record")).toBe(false);
  });

  it("updates nodes and edges through operation patches", () => {
    const document = createOntologyDocumentFromDataset(dataset);
    const next = applyOntologyOperations(document, [
      { type: "updateNode", id: "record", patch: { definition: "在线编辑后的过程记录类。" } },
      { type: "updateEdge", id: "record-device", patch: { label: "editedRecordedByDevice" } }
    ]);

    expect(next.spr_ontology.nodes.record.definition).toBe("在线编辑后的过程记录类。");
    expect(next.spr_ontology.relations.find((relation) => relation.id === "record-device")?.label).toBe("editedRecordedByDevice");
    expect(validateOntologyDocument(next).success).toBe(true);
  });
});
