type SelectionClassPlanInput = {
  selectedId?: string;
  highlightedIds?: string[];
  highlightedEdgeIds?: string[];
  edgeConnections?: Record<string, readonly [string, string] | string[]>;
};

type SelectionClassPlan = {
  selectedIds: string[];
  highlightedIds: string[];
  dimmedIds: string[];
};

export function buildSelectionClassPlan({
  selectedId,
  highlightedIds = [],
  highlightedEdgeIds = [],
  edgeConnections = {}
}: SelectionClassPlanInput): SelectionClassPlan {
  const highlighted = new Set<string>(highlightedIds);

  for (const edgeId of highlightedEdgeIds) {
    highlighted.add(edgeId);
    const connected = edgeConnections[edgeId];
    if (!connected) continue;
    for (const nodeId of connected) highlighted.add(nodeId);
  }

  return {
    selectedIds: selectedId ? [selectedId] : [],
    highlightedIds: Array.from(highlighted),
    dimmedIds: []
  };
}
