import { describe, expect, it } from "vitest";
import { parseFinalDeliveryDocument } from "../scripts/shared/final-document";

describe("final delivery document parser", () => {
  it("keeps the full markdown and extracts a navigable heading outline", () => {
    const parsed = parseFinalDeliveryDocument(`# A\n\nintro\n\n## B\n\nbody\n\n# C\n\nend`);

    expect(parsed.rawMarkdown).toContain("intro");
    expect(parsed.sections.map((section) => section.title)).toEqual(["A", "B", "C"]);
    expect(parsed.sections[1]).toMatchObject({ level: 2, title: "B" });
    expect(parsed.sections[1].content).toContain("body");
  });
});
