import demoDataset from "../data/processed/demo-dataset.json";
import { describe, expect, it } from "vitest";
import { createOntologyDocumentFromDataset, type DemoDataset } from "../shared/ontology";
import { parseOntologyDocument } from "../frontend/src/lib/data";

const dataset = demoDataset as unknown as DemoDataset;

describe("ontology data client", () => {
  it("rejects stale worker health responses before the editor uses them", () => {
    expect(() => parseOntologyDocument({ status: "ok", service: "spr-demo-api" })).toThrow("Worker 返回的本体文档无效");
  });

  it("accepts valid ontology documents returned by the worker", () => {
    const document = createOntologyDocumentFromDataset(dataset);

    expect(parseOntologyDocument(document).spr_ontology.nodes.record.name).toBe("SPR过程记录类");
  });
});
