import { describe, expect, it } from "vitest";
import { buildAppShellClassName, buildGraphWorkbenchClassName, resolveOwl2ModeForView } from "../frontend/src/app/appLayoutState";

describe("app layout state", () => {
  it("marks the shell as collapsed when the sidebar is folded", () => {
    expect(buildAppShellClassName(true)).toBe("app-shell sidebar-collapsed");
    expect(buildAppShellClassName(false)).toBe("app-shell");
  });

  it("marks ontology workbenches as graph-expanded in large graph mode", () => {
    expect(buildGraphWorkbenchClassName("top-workbench", true)).toBe("ontology-workbench top-workbench graph-expanded");
    expect(buildGraphWorkbenchClassName("spr-workbench", false)).toBe("ontology-workbench spr-workbench");
  });

  it("maps independent OWL2 business pages back to workbench modes", () => {
    expect(resolveOwl2ModeForView("owl2")).toBe("structure");
    expect(resolveOwl2ModeForView("owl2-rules")).toBe("rules");
    expect(resolveOwl2ModeForView("owl2-detect")).toBe("detect");
    expect(resolveOwl2ModeForView("owl2-root")).toBe("root");
    expect(resolveOwl2ModeForView("owl2-report")).toBe("report");
    expect(resolveOwl2ModeForView("owl2-knowledge")).toBe("knowledge");
  });
});
