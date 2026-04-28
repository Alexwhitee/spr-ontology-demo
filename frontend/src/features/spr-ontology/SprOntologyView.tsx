import { useMemo, useState } from "react";
import { Maximize2, Minimize2, Search } from "lucide-react";
import { OntologyGraph } from "../../components/OntologyGraph";
import { buildGraphWorkbenchClassName } from "../../app/appLayoutState";
import type { DemoDataset, FieldMapping, GraphEdge, GraphNode, ProcessRecord, SprOntologyNode } from "../../types/demo";

type LayerFilter = "all" | SprOntologyNode["layer"];

export function SprOntologyView({ dataset }: { dataset: DemoDataset }) {
  const [query, setQuery] = useState("");
  const [layer, setLayer] = useState<LayerFilter>("all");
  const [selectedId, setSelectedId] = useState("record");
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const graph = useMemo(() => sprGraph(dataset, layer), [dataset, layer]);
  const selected = dataset.spr_ontology.nodes[selectedId] ?? dataset.spr_ontology.nodes.record;
  const parentTop = dataset.top_ontology.nodes[selected.parent_top_id];
  const mappings = dataset.top_spr_mappings.filter((mapping) => mapping.spr_id === selected.id);
  const relatedFields = dataset.fieldMappings.filter((mapping) => mapping.ontologyClass === selected.name || selected.source_fields.includes(mapping.sourceField));
  const relatedRecords = findRelatedRecords(dataset.records, selected).slice(0, 6);
  const highlightedEdges = dataset.spr_ontology.relations.filter((relation) => relation.source === selected.id || relation.target === selected.id).map((relation) => relation.id);

  const searchResults = Object.values(dataset.spr_ontology.nodes).filter((node) => {
    const text = `${node.name} ${node.source_fields.join(" ")} ${node.definition}`.toLowerCase();
    return query.trim() && text.includes(query.toLowerCase());
  }).slice(0, 8);

  return (
    <section className="ontology-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">SPR Ontology</span>
          <h2>SPR 本体显式继承顶层工艺类</h2>
        </div>
        <div className="page-actions">
          <p>核心主链路、在线过程记录、曲线包络线、预测结果与规则解释都具有明确的 `parent_top_id`。</p>
          <button type="button" className="icon-text-button" onClick={() => setIsGraphExpanded((value) => !value)}>
            {isGraphExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span>{isGraphExpanded ? "退出大图" : "展开图谱"}</span>
          </button>
        </div>
      </div>
      <div className="toolbar">
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 SPR 类、字段或定义" />
        </label>
        {(["all", "spr-core", "spr-extension", "spr-data", "spr-rule"] as const).map((item) => (
          <button key={item} className={layer === item ? "active" : ""} onClick={() => setLayer(item)}>
            {layerLabel(item)}
          </button>
        ))}
      </div>
      {searchResults.length > 0 && (
        <div className="search-results">
          {searchResults.map((node) => (
            <button key={node.id} onClick={() => setSelectedId(node.id)}>{node.name}</button>
          ))}
        </div>
      )}
      <div className={buildGraphWorkbenchClassName("spr-workbench", isGraphExpanded)}>
        <OntologyGraph
          nodes={graph.nodes}
          edges={graph.edges}
          selectedId={selected.id}
          highlightedIds={[selected.id, selected.parent_top_id]}
          highlightedEdgeIds={highlightedEdges}
          onSelect={(node) => setSelectedId(node.id)}
        />
        <aside className="inspector">
          <div className={`node-badge ${selected.layer}`}>{layerLabel(selected.layer)}</div>
          <h2>{selected.name}</h2>
          <p>{selected.definition}</p>
          <div className="breadcrumb-line">
            <span>顶层工艺本体</span>
            <span>{parentTop?.domain}</span>
            <strong>{parentTop?.name}</strong>
            <span>{selected.inheritance_relation}</span>
            <strong>{selected.name}</strong>
          </div>
          <dl className="detail-grid">
            <dt>parent_top_id</dt>
            <dd>{selected.parent_top_id}</dd>
            <dt>继承关系</dt>
            <dd>{selected.inheritance_relation}</dd>
            <dt>来源</dt>
            <dd>{selected.source_doc}</dd>
            <dt>实例数</dt>
            <dd>{selected.instanceCount ?? "-"}</dd>
          </dl>
          <h4>文档证据</h4>
          <div className="evidence-list">
            {mappings.map((mapping) => (
              <div key={mapping.id}>
                <strong>{mapping.evidence}</strong>
                <span>{mapping.source_section}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
      <div className="detail-tabs">
        <InfoPanel title="字段承载" count={relatedFields.length}>
          <MappingMiniTable mappings={relatedFields.slice(0, 10)} />
        </InfoPanel>
        <InfoPanel title="实例样例" count={relatedRecords.length}>
          <div className="mini-records">
            {relatedRecords.map((record) => (
              <div key={record.id}>
                <strong>{record.id}</strong>
                <span>{record.deviceName ?? record.lineName ?? "-"} · {record.program ?? "-"}</span>
              </div>
            ))}
          </div>
        </InfoPanel>
        <InfoPanel title="关系网络" count={selected.relations.length}>
          <div className="relation-list compact">
            {selected.relations.map((id) => {
              const relation = dataset.spr_ontology.relations.find((item) => item.id === id);
              return relation ? <div key={id}>{relation.source} → <strong>{relation.label}</strong> → {relation.target}</div> : null;
            })}
          </div>
        </InfoPanel>
      </div>
    </section>
  );
}

function sprGraph(dataset: DemoDataset, layer: LayerFilter): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const visible = Object.values(dataset.spr_ontology.nodes).filter((node) => layer === "all" || node.layer === layer);
  const ids = new Set(visible.map((node) => node.id));
  return {
    nodes: visible.map((node) => ({
      id: node.id,
      label: node.name,
      type: node.layer === "spr-rule" ? "rule" : "class",
      group: node.layer === "spr-core" ? "spr-core" : node.layer === "spr-rule" ? "reasoning" : "spr-extension",
      description: node.definition,
      sourceFields: node.source_fields,
      instanceCount: node.instanceCount
    })),
    edges: dataset.spr_ontology.relations
      .filter((relation) => ids.has(relation.source) && ids.has(relation.target))
      .map((relation) => ({
        id: relation.id,
        source: relation.source,
        target: relation.target,
        label: relation.label,
        type: relation.type === "subclass-of" ? "inherits" : relation.type
      }))
  };
}

function layerLabel(layer: LayerFilter) {
  return {
    all: "全部",
    "spr-core": "核心类",
    "spr-extension": "扩展类",
    "spr-data": "数据类",
    "spr-rule": "规则类"
  }[layer];
}

function findRelatedRecords(records: ProcessRecord[], node: SprOntologyNode): ProcessRecord[] {
  if (node.id === "record") return records.slice(0, 20);
  if (node.id === "curve-data" || node.id.includes("curve") || node.id === "envelope") return records.filter((record) => record.curveSummary?.original || record.curveSummary?.riveting);
  if (node.id === "quality" || node.id === "defect") return records.filter((record) => record.faultCode && record.faultCode !== "-");
  if (node.id === "device") return records.filter((record) => record.deviceName);
  if (node.id === "program") return records.filter((record) => record.program);
  return records.filter((record) => node.source_fields.some((field) => field in record.raw));
}

function InfoPanel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h3>{title}</h3>
        <span>{count}</span>
      </div>
      {children}
    </section>
  );
}

function MappingMiniTable({ mappings }: { mappings: FieldMapping[] }) {
  if (mappings.length === 0) return <p className="muted">暂无直接字段映射</p>;
  return (
    <div className="mini-table">
      {mappings.map((mapping) => (
        <div key={`${mapping.sourceTable}-${mapping.sourceField}`}>
          <strong>{mapping.sourceField}</strong>
          <span>{mapping.ontologyProperty}</span>
          <em>{mapping.status}</em>
        </div>
      ))}
    </div>
  );
}
