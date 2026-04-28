export function buildAppShellClassName(isSidebarCollapsed: boolean) {
  return isSidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell";
}

export function buildGraphWorkbenchClassName(workbenchClassName: "top-workbench" | "spr-workbench", isGraphExpanded: boolean) {
  return isGraphExpanded ? `ontology-workbench ${workbenchClassName} graph-expanded` : `ontology-workbench ${workbenchClassName}`;
}
