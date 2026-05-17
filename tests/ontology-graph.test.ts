import { describe, expect, it } from "vitest";
import { buildGraphDisplayElements, buildSelectionClassPlan } from "../frontend/src/components/ontologyGraphState";

describe("ontology graph selection state", () => {
  it("keeps unrelated ontology nodes visible while emphasizing selected context", () => {
    const plan = buildSelectionClassPlan({
      selectedId: "curve-data",
      highlightedIds: ["curve-data", "record"],
      highlightedEdgeIds: ["rel-record-curve"],
      edgeConnections: {
        "rel-record-curve": ["record", "curve-data"]
      }
    });

    expect(plan.dimmedIds).toEqual([]);
    expect(plan.selectedIds).toEqual(["curve-data"]);
    expect(plan.highlightedIds).toEqual(["curve-data", "record", "rel-record-curve"]);
  });

  it("translates edge labels for display without changing the source graph data", () => {
    const nodes = [{ id: "record", label: "SPR过程记录类", type: "class" as const, group: "spr-extension" as const }];
    const edges = [{ id: "record-device", source: "record", target: "device", label: "recordedByDevice", type: "objectProperty" as const }];

    const elements = buildGraphDisplayElements(nodes, edges);

    expect(elements.edges[0].data.label).toBe("由设备记录");
    expect(edges[0].label).toBe("recordedByDevice");
  });
});
