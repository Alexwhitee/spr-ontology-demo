import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { OntologyGraph } from "../../components/OntologyGraph";
import type { DemoDataset, GraphEdge, GraphNode, TopOntologyNode } from "../../types/demo";

type Props = {
  dataset: DemoDataset;
};

export function TopOntologyView({ dataset }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(dataset.top_ontology.root_ids));
  const [selectedId, setSelectedId] = useState("domain-process");
  const selected = dataset.top_ontology.nodes[selectedId] ?? dataset.top_ontology.nodes[dataset.top_ontology.root_ids[0]];
  const mappedSpr = dataset.top_spr_mappings
    .filter((mapping) => mapping.top_id === selected.id)
    .map((mapping) => dataset.spr_ontology.nodes[mapping.spr_id])
    .filter(Boolean);
  const graph = useMemo(() => topGraph(dataset), [dataset]);
  const highlightedIds = useMemo(() => [selected.id, ...selected.children], [selected]);

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="ontology-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">Top-Level Ontology</span>
          <h2>顶层工艺本体是 SPR 的抽象承载层</h2>
        </div>
        <p>依据《顶层工艺本体建设方案_v0.2.md》和《顶层工艺本体补充建议.md》，稳定类与候选补充类分层展示。</p>
      </div>
      <div className="ontology-workbench top-workbench">
        <aside className="tree-pane">
          <div className="section-heading">
            <h3>分类体系</h3>
            <span>{Object.keys(dataset.top_ontology.nodes).length} 类</span>
          </div>
          <div className="ontology-tree">
            {dataset.top_ontology.root_ids.map((id) => (
              <TreeNode
                key={id}
                node={dataset.top_ontology.nodes[id]}
                nodes={dataset.top_ontology.nodes}
                selectedId={selected.id}
                expanded={expanded}
                onToggle={toggle}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        </aside>
        <OntologyGraph
          nodes={graph.nodes}
          edges={graph.edges}
          selectedId={selected.id}
          highlightedIds={highlightedIds}
          onSelect={(node) => setSelectedId(node.id)}
        />
        <aside className="inspector">
          <div className={`node-badge ${selected.status === "candidate" ? "candidate" : "top"}`}>
            {selected.status === "candidate" ? "候选补充" : selected.domain}
          </div>
          <h2>{selected.name}</h2>
          <p>{selected.definition}</p>
          <dl className="detail-grid">
            <dt>父类</dt>
            <dd>{selected.parent_id ? dataset.top_ontology.nodes[selected.parent_id]?.name : "顶层域"}</dd>
            <dt>下位类</dt>
            <dd>{selected.children.length}</dd>
            <dt>SPR 映射</dt>
            <dd>{mappedSpr.length}</dd>
            <dt>来源</dt>
            <dd>{selected.source_doc}</dd>
          </dl>
          <h4>属性</h4>
          <div className="property-list">
            {selected.properties.map((property) => (
              <div key={property.name}>
                <strong>{property.name}</strong>
                <span>{property.description}</span>
              </div>
            ))}
          </div>
          <h4>下位 SPR 映射</h4>
          <div className="mapping-chips">
            {mappedSpr.length > 0 ? mappedSpr.map((node) => <span key={node.id}>{node.name}</span>) : <em>当前节点暂无直接 SPR 映射</em>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function TreeNode({
  node,
  nodes,
  selectedId,
  expanded,
  onToggle,
  onSelect
}: {
  node: TopOntologyNode;
  nodes: Record<string, TopOntologyNode>;
  selectedId: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  return (
    <div className="tree-node">
      <button className={selectedId === node.id ? "selected" : ""} onClick={() => onSelect(node.id)}>
        <span className="tree-toggle" onClick={(event) => { event.stopPropagation(); if (hasChildren) onToggle(node.id); }}>
          {hasChildren ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        <span>{node.name}</span>
        {node.status === "candidate" && <small>候选</small>}
      </button>
      {isOpen && hasChildren && (
        <div className="tree-children">
          {node.children.map((id) => (
            <TreeNode key={id} node={nodes[id]} nodes={nodes} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function topGraph(dataset: DemoDataset): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return {
    nodes: Object.values(dataset.top_ontology.nodes).map((node) => ({
      id: node.id,
      label: node.name,
      type: "class",
      group: "top",
      description: node.definition,
      instanceCount: dataset.top_spr_mappings.filter((mapping) => mapping.top_id === node.id).length,
      status: node.status
    } as GraphNode)),
    edges: Object.values(dataset.top_ontology.nodes)
      .filter((node) => node.parent_id)
      .map((node) => ({
        id: `top-${node.parent_id}-${node.id}`,
        source: node.parent_id as string,
        target: node.id,
        label: "subclass-of",
        type: "inherits"
      }))
  };
}
