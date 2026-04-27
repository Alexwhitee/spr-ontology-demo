import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import type { GraphEdge, GraphNode } from "../types/demo";

type OntologyGraphProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  view: "all" | "top" | "core" | "extension" | "reasoning";
  selectedId?: string;
  onSelect: (node: GraphNode) => void;
};

const visibleGroups = {
  all: new Set(["top", "spr-core", "spr-extension", "reasoning", "data"]),
  top: new Set(["top", "spr-core"]),
  core: new Set(["spr-core"]),
  extension: new Set(["spr-extension", "spr-core"]),
  reasoning: new Set(["reasoning", "spr-extension", "spr-core"])
};

export function OntologyGraph({ nodes, edges, view, selectedId, onSelect }: OntologyGraphProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const filtered = useMemo(() => {
    const groups = visibleGroups[view];
    const visibleNodes = nodes.filter((node) => groups.has(node.group));
    const ids = new Set(visibleNodes.map((node) => node.id));
    return {
      nodes: visibleNodes,
      edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    };
  }, [edges, nodes, view]);

  useEffect(() => {
    if (!ref.current) return;
    const cy = cytoscape({
      container: ref.current,
      elements: [
        ...filtered.nodes.map((node) => ({ data: node })),
        ...filtered.edges.map((edge) => ({ data: edge }))
      ],
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "background-color": "#4b6fef",
            color: "#172033",
            "font-family": "Inter, PingFang SC, system-ui",
            "font-size": 12,
            "text-valign": "center",
            "text-halign": "center",
            "text-wrap": "wrap",
            "text-max-width": 88,
            width: 74,
            height: 74,
            "border-width": 2,
            "border-color": "#ffffff"
          }
        },
        { selector: 'node[group = "top"]', style: { "background-color": "#2447a8", color: "#ffffff" } },
        { selector: 'node[group = "spr-core"]', style: { "background-color": "#159a75", color: "#ffffff" } },
        { selector: 'node[group = "spr-extension"]', style: { "background-color": "#f28c28", color: "#111827" } },
        { selector: 'node[group = "reasoning"]', style: { "background-color": "#d84c5f", color: "#ffffff", shape: "diamond" } },
        {
          selector: "edge",
          style: {
            label: "data(label)",
            width: 1.5,
            "line-color": "#aab4c5",
            "target-arrow-color": "#aab4c5",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "font-size": 9,
            color: "#5b6472",
            "text-background-color": "#ffffff",
            "text-background-opacity": 0.86,
            "text-background-padding": 2
          }
        },
        { selector: ".selected", style: { "border-width": 5, "border-color": "#121826" } }
      ],
      layout: { name: "cose", animate: false, padding: 36, nodeRepulsion: 9000, idealEdgeLength: 120 }
    });

    cy.on("tap", "node", (event) => {
      const id = event.target.id();
      const node = filtered.nodes.find((item) => item.id === id);
      if (node) onSelect(node);
    });

    if (selectedId) cy.$id(selectedId).addClass("selected");
    return () => cy.destroy();
  }, [filtered, onSelect, selectedId]);

  return <div ref={ref} className="graph-canvas" />;
}
