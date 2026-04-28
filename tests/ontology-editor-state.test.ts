import demoDataset from "../data/processed/demo-dataset.json";
import { describe, expect, it } from "vitest";
import { createOntologyDocumentFromDataset, type DemoDataset } from "../shared/ontology";
import { applySelectedNodeDraft, createSelectedNodeDraft, getEditorGraph, removeSelectedNode } from "../frontend/src/features/ontology-editor/ontologyEditorState";

const dataset = demoDataset as unknown as DemoDataset;

describe("ontology editor state", () => {
  it("turns inspector form edits into validated ontology updates", () => {
    const document = createOntologyDocumentFromDataset(dataset);
    const draft = createSelectedNodeDraft(document, "record");
    const next = applySelectedNodeDraft(document, { ...draft, name: "在线过程记录类", definition: "从编辑器更新。" });

    expect(next.spr_ontology.nodes.record.name).toBe("在线过程记录类");
    expect(next.spr_ontology.nodes.record.definition).toBe("从编辑器更新。");
  });

  it("removes a selected node with cascade cleanup for relations and mappings", () => {
    const document = createOntologyDocumentFromDataset(dataset);
    const next = removeSelectedNode(document, "record");

    expect(next.spr_ontology.nodes.record).toBeUndefined();
    expect(next.spr_ontology.relations.some((relation) => relation.source === "record" || relation.target === "record")).toBe(false);
    expect(next.top_spr_mappings.some((mapping) => mapping.spr_id === "record")).toBe(false);
  });

  it("separates top, SPR, and mapping graphs for clearer editing", () => {
    const document = createOntologyDocumentFromDataset(dataset);
    const topGraph = getEditorGraph(document, "top");
    const sprGraph = getEditorGraph(document, "spr");
    const mappingGraph = getEditorGraph(document, "mapping");

    expect(topGraph.nodes.every((node) => node.group === "top")).toBe(true);
    expect(topGraph.edges.every((edge) => edge.id.startsWith("top-"))).toBe(true);
    expect(sprGraph.nodes.every((node) => node.group !== "top")).toBe(true);
    expect(sprGraph.edges.every((edge) => !edge.id.startsWith("mapping-"))).toBe(true);
    expect(mappingGraph.edges.every((edge) => edge.id.startsWith("mapping-"))).toBe(true);
  });
});
