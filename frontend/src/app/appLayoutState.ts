export function buildAppShellClassName(isSidebarCollapsed: boolean) {
  return isSidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell";
}

export function buildGraphWorkbenchClassName(workbenchClassName: "top-workbench" | "spr-workbench", isGraphExpanded: boolean) {
  return isGraphExpanded ? `ontology-workbench ${workbenchClassName} graph-expanded` : `ontology-workbench ${workbenchClassName}`;
}

export type Owl2BusinessView = "owl2" | "owl2-rules" | "owl2-detect" | "owl2-root" | "owl2-report" | "owl2-knowledge";
export type Owl2WorkbenchMode = "structure" | "rules" | "detect" | "root" | "report" | "knowledge";

export function resolveOwl2ModeForView(view: Owl2BusinessView): Owl2WorkbenchMode {
  return {
    owl2: "structure",
    "owl2-rules": "rules",
    "owl2-detect": "detect",
    "owl2-root": "root",
    "owl2-report": "report",
    "owl2-knowledge": "knowledge"
  }[view];
}
