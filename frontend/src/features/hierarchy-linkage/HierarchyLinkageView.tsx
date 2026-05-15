import { useMemo, useState } from "react";
import { LocateFixed, Route } from "lucide-react";
import { OntologyGraph } from "../../components/OntologyGraph";
import { labelMappingRelation, labelRelation } from "../../i18n/zhCN";
import type { DemoDataset, GraphEdge, GraphNode, SprOntologyNode, TopOntologyNode } from "../../types/demo";

export function HierarchyLinkageView({ dataset }: { dataset: DemoDataset }) {
  const [selectedTopId, setSelectedTopId] = useState("curve-data-top");
  const [selectedSprId, setSelectedSprId] = useState("curve-data");
  const selectedTop = dataset.top_ontology.nodes[selectedTopId];
  const selectedSpr = dataset.spr_ontology.nodes[selectedSprId];
  const mappedSprIds = dataset.top_spr_mappings.filter((mapping) => mapping.top_id === selectedTopId).map((mapping) => mapping.spr_id);
  const reverseTopPath = topPath(selectedSpr.parent_top_id, dataset.top_ontology.nodes);
  const activeMapping = dataset.top_spr_mappings.find((mapping) => mapping.top_id === selectedTopId && mapping.spr_id === selectedSprId)
    ?? dataset.top_spr_mappings.find((mapping) => mapping.spr_id === selectedSprId)
    ?? dataset.top_spr_mappings.find((mapping) => mapping.top_id === selectedTopId);
  const activePath = activeMapping ? dataset.hierarchy_paths.find((path) => path.mapping_id === activeMapping.id) : undefined;

  const topGraphData = useMemo(() => topGraph(dataset), [dataset]);
  const sprGraphData = useMemo(() => sprGraph(dataset), [dataset]);

  function selectTop(id: string) {
    setSelectedTopId(id);
    const firstSpr = dataset.top_spr_mappings.find((mapping) => mapping.top_id === id)?.spr_id;
    if (firstSpr) setSelectedSprId(firstSpr);
  }

  function selectSpr(node: SprOntologyNode) {
    setSelectedSprId(node.id);
    setSelectedTopId(node.parent_top_id);
  }

  return (
    <section className="ontology-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">层级联动</span>
          <h2>点击任一层，即可看到抽象类与 SPR 类的双向映射</h2>
        </div>
      </div>
      <div className="linkage-grid">
        <section className="linkage-panel">
          <div className="section-heading">
            <h3>顶层工艺本体</h3>
            <span>{selectedTop?.name}</span>
          </div>
          <OntologyGraph
            nodes={topGraphData.nodes}
            edges={topGraphData.edges}
            className="linkage-graph"
            selectedId={selectedTopId}
            highlightedIds={[selectedTopId, ...topPath(selectedTopId, dataset.top_ontology.nodes)]}
            onSelect={(node) => selectTop(node.id)}
          />
        </section>
        <section className="linkage-panel">
          <div className="section-heading">
            <h3>SPR 本体</h3>
            <span>{selectedSpr?.name}</span>
          </div>
          <OntologyGraph
            nodes={sprGraphData.nodes}
            edges={sprGraphData.edges}
            className="linkage-graph"
            selectedId={selectedSprId}
            highlightedIds={[selectedSprId, ...mappedSprIds]}
            highlightedEdgeIds={dataset.spr_ontology.relations.filter((relation) => relation.source === selectedSprId || relation.target === selectedSprId).map((relation) => relation.id)}
            onSelect={(node) => {
              const spr = dataset.spr_ontology.nodes[node.id];
              if (spr) selectSpr(spr);
            }}
          />
        </section>
      </div>
      <div className="path-board">
        <section className="panel">
          <div className="section-heading">
            <h3><Route size={18} /> 顶层到 SPR 路径追踪</h3>
            <span>{labelMappingRelation(activeMapping?.relation)}</span>
          </div>
          <div className="path-line rich">
            {(activePath?.top_path ?? topPath(selectedTopId, dataset.top_ontology.nodes)).map((id) => (
              <button key={id} onClick={() => selectTop(id)}>{dataset.top_ontology.nodes[id]?.name ?? id}</button>
            ))}
            <button className="spr-path" onClick={() => setSelectedSprId(selectedSprId)}>{selectedSpr?.name}</button>
          </div>
          <p className="large-text">{activeMapping?.evidence ?? "请选择一个存在映射关系的顶层类或 SPR 类。"}</p>
          <small className="source-line">{activeMapping?.source_section}</small>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h3><LocateFixed size={18} /> 反向定位</h3>
            <span>{selectedSpr?.parent_top_id}</span>
          </div>
          <div className="breadcrumb-line">
            {reverseTopPath.map((id) => <span key={id}>{dataset.top_ontology.nodes[id]?.name ?? id}</span>)}
            <strong>{selectedSpr?.name}</strong>
          </div>
          <dl className="detail-grid">
            <dt>SPR 类</dt>
            <dd>{selectedSpr?.name}</dd>
            <dt>顶层父类</dt>
            <dd>{dataset.top_ontology.nodes[selectedSpr?.parent_top_id]?.name}</dd>
            <dt>继承关系</dt>
            <dd>{labelRelation(selectedSpr?.inheritance_relation)}</dd>
          </dl>
        </section>
      </div>
    </section>
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
      status: node.status
    } as GraphNode)),
    edges: Object.values(dataset.top_ontology.nodes)
      .filter((node) => node.parent_id)
      .map((node) => ({ id: `top-${node.parent_id}-${node.id}`, source: node.parent_id as string, target: node.id, label: "subclass-of", type: "inherits" }))
  };
}

function sprGraph(dataset: DemoDataset): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return {
    nodes: Object.values(dataset.spr_ontology.nodes).map((node) => ({
      id: node.id,
      label: node.name,
      type: node.layer === "spr-rule" ? "rule" : "class",
      group: node.layer === "spr-core" ? "spr-core" : node.layer === "spr-rule" ? "reasoning" : "spr-extension",
      description: node.definition,
      sourceFields: node.source_fields
    })),
    edges: dataset.spr_ontology.relations.map((relation) => ({
      id: relation.id,
      source: relation.source,
      target: relation.target,
      label: relation.label,
      type: relation.type === "subclass-of" ? "inherits" : relation.type
    }))
  };
}

function topPath(id: string, nodes: Record<string, TopOntologyNode>): string[] {
  const path: string[] = [];
  let current: TopOntologyNode | undefined = nodes[id];
  while (current) {
    path.unshift(current.id);
    current = current.parent_id ? nodes[current.parent_id] : undefined;
  }
  return path;
}
