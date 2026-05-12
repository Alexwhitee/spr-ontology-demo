import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("OWL2 ontology files", () => {
  it("ships the planned OWL2 module files", () => {
    for (const file of ["core.owl", "process.owl", "resource.owl", "quality.owl", "model.owl", "spr.owl"]) {
      const fullPath = path.join(root, "ontology", file);
      expect(fs.existsSync(fullPath), `${file} should exist`).toBe(true);
      expect(fs.readFileSync(fullPath, "utf8")).toContain("owl:Ontology");
    }
  });

  it("keeps the SPR extension focused on ontology inheritance and quality closure", () => {
    const spr = fs.readFileSync(path.join(root, "ontology", "spr.owl"), "utf8");

    expect(spr).toContain("SPRProcessRecord");
    expect(spr).toContain("OnlineProcessRecord");
    expect(spr).toContain("SPRInspectionProcess");
    expect(spr).toContain("RootCause");
    expect(spr).not.toContain("知识图谱");
    expect(spr).not.toContain("带参实例图谱");
  });
});
