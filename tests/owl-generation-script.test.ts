import { describe, expect, it } from "vitest";
import { buildOwlModules, ONTOLOGY_MODULES } from "../scripts/generate-owl-modules";

describe("scripted OWL2 module generation", () => {
  it("builds each planned OWL2 module from shared descriptors", () => {
    const modules = buildOwlModules();

    expect(ONTOLOGY_MODULES).toEqual(["core.owl", "process.owl", "resource.owl", "quality.owl", "model.owl", "spr.owl"]);
    expect(Object.keys(modules).sort()).toEqual([...ONTOLOGY_MODULES, "generated/current.owl"].sort());
    expect(modules["spr.owl"]).toContain("SPRInspectionProcess");
    expect(modules["quality.owl"]).toContain("QualityRule");
    expect(modules["model.owl"]).toContain("DetectionModel");
  });

  it("builds an aggregate OWL export that imports the generated modules", () => {
    const modules = buildOwlModules();
    const aggregate = modules["generated/current.owl"];

    expect(aggregate).toContain("<owl:Ontology");
    for (const moduleName of ONTOLOGY_MODULES) {
      expect(aggregate).toContain(moduleName);
    }
  });
});
