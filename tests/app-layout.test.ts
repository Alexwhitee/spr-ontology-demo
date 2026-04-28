import { describe, expect, it } from "vitest";
import { buildAppShellClassName, buildGraphWorkbenchClassName } from "../frontend/src/app/appLayoutState";

describe("app layout state", () => {
  it("marks the shell as collapsed when the sidebar is folded", () => {
    expect(buildAppShellClassName(true)).toBe("app-shell sidebar-collapsed");
    expect(buildAppShellClassName(false)).toBe("app-shell");
  });

  it("marks ontology workbenches as graph-expanded in large graph mode", () => {
    expect(buildGraphWorkbenchClassName("top-workbench", true)).toBe("ontology-workbench top-workbench graph-expanded");
    expect(buildGraphWorkbenchClassName("spr-workbench", false)).toBe("ontology-workbench spr-workbench");
  });
});
