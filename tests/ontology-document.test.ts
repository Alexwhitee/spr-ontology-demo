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

  it("keeps graph labels readable in Chinese while relation labels remain technical IDs", () => {
    const labels = dataset.ontology.nodes.map((node) => node.label);

    expect(labels).toContain("设备类");
    expect(labels).toContain("SPR过程记录类");
    expect(labels).toContain("根因类");
    expect(labels).not.toContain("Spring");
    expect(dataset.ontology.edges.find((edge) => edge.id === "record-device")?.label).toBe("recordedByDevice");
  });

  it("keeps root-cause semantic mapping without drawing a duplicate root-cause display edge", () => {
    expect(dataset.top_spr_mappings.some((mapping) => mapping.id === "root-cause-top-root-cause")).toBe(true);
    expect(dataset.ontology.edges.some((edge) => edge.id === "mapping-root-cause-top-root-cause")).toBe(false);
  });

  it("maps all 16 main database fields into ontology properties", () => {
    const expectedMainFields = [
      "id",
      "biz_id",
      "prog_no",
      "rivet_id",
      "carbody_id",
      "line_name",
      "device_name",
      "original_data",
      "calculate_data",
      "error_rate",
      "pre",
      "consumer_time",
      "origin_time",
      "is_deleted",
      "create_time",
      "update_time"
    ];

    const mainMappings = dataset.fieldMappings.filter((mapping) => mapping.sourceTable === "main");

    expect(mainMappings.map((mapping) => mapping.sourceField).sort()).toEqual([...expectedMainFields].sort());
    expect(mainMappings.every((mapping) => mapping.ontologyClass && mapping.ontologyProperty && mapping.note)).toBe(true);
  });

  it("defines ontology properties with English property names and source-field descriptions", () => {
    const record = dataset.spr_ontology.nodes.record;
    const program = dataset.spr_ontology.nodes.program;
    const joint = dataset.spr_ontology.nodes.joint;

    expect(record.properties.map((property) => property.name)).toEqual(expect.arrayContaining(["recordId", "businessId", "originTime", "consumerTime"]));
    expect(program.properties.map((property) => property.name)).toEqual(expect.arrayContaining(["programNumber"]));
    expect(joint.properties.map((property) => property.name)).toEqual(expect.arrayContaining(["rivetPointId"]));
    expect(record.properties.find((property) => property.name === "recordId")?.description).toContain("来源字段：id");
  });
});
