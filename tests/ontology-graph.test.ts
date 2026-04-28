import { describe, expect, it } from "vitest";
import { buildSelectionClassPlan } from "../frontend/src/components/ontologyGraphState";

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
});
