import { useEffect, useMemo, useState } from "react";
import {
  Binary,
  BookOpen,
  Boxes,
  BrainCircuit,
  ChartLine,
  Database,
  FileText,
  GitBranch,
  LayoutDashboard,
  ListFilter,
  Network,
  Play
} from "lucide-react";
import { Chart } from "../components/Chart";
import { OntologyGraph } from "../components/OntologyGraph";
import { loadDataset, loadRecordCurves } from "../lib/data";
import { explainRecord } from "../lib/reasoning";
import type { DemoDataset, FieldMapping, GraphNode, ProcessRecord, ReasoningResult } from "../types/demo";

type ViewKey = "dashboard" | "ontology" | "mapping" | "instances" | "curves" | "reasoning" | "script";

const navItems: Array<{ key: ViewKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "dashboard", label: "总览", icon: LayoutDashboard },
  { key: "ontology", label: "本体结构", icon: Network },
  { key: "mapping", label: "字段映射", icon: ListFilter },
  { key: "instances", label: "数据实例", icon: Database },
  { key: "curves", label: "曲线", icon: ChartLine },
  { key: "reasoning", label: "推理", icon: BrainCircuit },
  { key: "script", label: "脚本", icon: Play }
];

export default function App() {
  const [dataset, setDataset] = useState<DemoDataset | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [selectedRecord, setSelectedRecord] = useState<ProcessRecord | null>(null);
  const [curveRecord, setCurveRecord] = useState<ProcessRecord | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [reasoning, setReasoning] = useState<ReasoningResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDataset()
      .then((data) => {
        setDataset(data);
        const defaultRecord = data.records.find((record) => record.faultCode?.includes("高于包络线")) ?? data.records[0];
        setSelectedRecord(defaultRecord);
        setSelectedNode(data.ontology.nodes.find((node) => node.id === "record") ?? data.ontology.nodes[0]);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (!selectedRecord) return;
    loadRecordCurves(selectedRecord)
      .then((record) => {
        setCurveRecord(record);
        setReasoning(explainRecord(record));
      })
      .catch(() => {
        setCurveRecord(selectedRecord);
        setReasoning(explainRecord(selectedRecord));
      });
  }, [selectedRecord]);

  if (error) {
    return <div className="fatal">数据加载失败：{error}</div>;
  }

  if (!dataset) {
    return <div className="loading">SPR Demo 数据加载中</div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Boxes size={30} />
          <div>
            <strong>SPR 本体 Demo</strong>
            <span>工艺知识图谱演示系统</span>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={activeView === item.key ? "active" : ""} onClick={() => setActiveView(item.key)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <Binary size={18} />
          <span>{dataset.records.length} 条记录 · {dataset.fieldMappings.length} 个字段映射</span>
        </div>
      </aside>

      <main className="workspace">
        <TopBar dataset={dataset} />
        {activeView === "dashboard" && <Dashboard dataset={dataset} onNavigate={setActiveView} />}
        {activeView === "ontology" && (
          <OntologyView dataset={dataset} selectedNode={selectedNode} onSelectNode={setSelectedNode} />
        )}
        {activeView === "mapping" && <FieldMappingView mappings={dataset.fieldMappings} />}
        {activeView === "instances" && (
          <InstancesView dataset={dataset} selectedRecord={selectedRecord} onSelectRecord={setSelectedRecord} />
        )}
        {activeView === "curves" && (
          <CurvesView dataset={dataset} record={curveRecord ?? selectedRecord} onSelectRecord={setSelectedRecord} reasoning={reasoning} />
        )}
        {activeView === "reasoning" && (
          <ReasoningView dataset={dataset} record={curveRecord ?? selectedRecord} reasoning={reasoning} onSelectRecord={setSelectedRecord} />
        )}
        {activeView === "script" && <DemoScriptView dataset={dataset} onNavigate={setActiveView} />}
      </main>
    </div>
  );
}

function TopBar({ dataset }: { dataset: DemoDataset }) {
  return (
    <header className="topbar">
      <div>
        <h1>从数据库字段到可解释 SPR 工艺本体</h1>
      </div>
      <div className="topbar-meta">
        <span>生成时间 {new Date(dataset.generatedAt).toLocaleString("zh-CN")}</span>
      </div>
    </header>
  );
}

function Dashboard({ dataset, onNavigate }: { dataset: DemoDataset; onNavigate: (view: ViewKey) => void }) {
  const metrics = dataset.summary.metrics;
  const faultOption = useMemo(() => pieOption(dataset.summary.distributions.fault, "故障分布"), [dataset]);
  const lineOption = useMemo(() => barOption(dataset.summary.distributions.line, "产线记录分布"), [dataset]);

  return (
    <section className="view-stack">
      <div className="hero-band">
        <div>
          <span className="eyebrow">SPR Ontology Demo</span>
          <h2>把 58 个真实数据库字段组织成可追溯、可解释、可演示的工艺知识网络。</h2>
        </div>
        <div className="hero-actions">
          <button onClick={() => onNavigate("ontology")}>
            <GitBranch size={18} />
            看本体结构
          </button>
          <button onClick={() => onNavigate("curves")}>
            <ChartLine size={18} />
            看异常曲线
          </button>
        </div>
      </div>

      <div className="metrics-grid">
        <Metric label="主表记录" value={metrics.mainRecords} />
        <Metric label="RIP_ROP 记录" value={metrics.ripRopRecords} />
        <Metric label="主数据库字段" value={metrics.mainFields} />
        <Metric label="RIP_ROP 字段" value={metrics.ripRopFields} />
        <Metric label="新增/扩展类" value={metrics.extensionClasses} />
        <Metric label="新增关系" value={metrics.addedRelations} />
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="section-heading">
            <h3>故障类型</h3>
            <span>RIP_ROP 177 条记录</span>
          </div>
          <Chart option={faultOption} />
        </section>
        <section className="panel">
          <div className="section-heading">
            <h3>产线覆盖</h3>
            <span>主数据库 666 条记录</span>
          </div>
          <Chart option={lineOption} />
        </section>
      </div>

      <div className="conclusion-strip">
        {dataset.summary.conclusions.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </section>
  );
}

function OntologyView({ dataset, selectedNode, onSelectNode }: { dataset: DemoDataset; selectedNode: GraphNode | null; onSelectNode: (node: GraphNode) => void }) {
  const [view, setView] = useState<"all" | "top" | "core" | "extension" | "reasoning">("all");

  return (
    <section className="view-stack">
      <div className="toolbar">
        {[
          ["all", "全量视图"],
          ["top", "顶层/主链路"],
          ["core", "原 SPR 主链路"],
          ["extension", "v0.3 扩展层"],
          ["reasoning", "推理路径"]
        ].map(([key, label]) => (
          <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key as typeof view)}>
            {label}
          </button>
        ))}
      </div>
      <div className="graph-layout">
        <OntologyGraph nodes={dataset.ontology.nodes} edges={dataset.ontology.edges} view={view} selectedId={selectedNode?.id} onSelect={onSelectNode} />
        <aside className="inspector">
          <div className={`node-badge ${selectedNode?.group ?? ""}`}>{selectedNode?.group ?? "node"}</div>
          <h2>{selectedNode?.label}</h2>
          <p>{selectedNode?.description}</p>
          {selectedNode?.instanceCount !== undefined && <Metric label="示例实例数" value={selectedNode.instanceCount} compact />}
          <FieldChips fields={selectedNode?.sourceFields ?? []} />
          <h4>关联关系</h4>
          <ul className="relation-list">
            {dataset.ontology.edges
              .filter((edge) => edge.source === selectedNode?.id || edge.target === selectedNode?.id)
              .slice(0, 12)
              .map((edge) => (
                <li key={edge.id}>
                  <span>{edge.label}</span>
                  <small>{edge.source} → {edge.target}</small>
                </li>
              ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}

function FieldMappingView({ mappings }: { mappings: FieldMapping[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FieldMapping["status"] | "全部">("全部");
  const filtered = mappings.filter((mapping) => {
    const text = `${mapping.sourceField} ${mapping.ontologyClass} ${mapping.ontologyProperty}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (status === "全部" || mapping.status === status);
  });

  return (
    <section className="view-stack">
      <div className="toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索字段、类或属性" />
        {["全部", "已有类可承载", "需补属性", "需新增扩展类", "需确认"].map((item) => (
          <button key={item} className={status === item ? "active" : ""} onClick={() => setStatus(item as typeof status)}>
            {item}
          </button>
        ))}
      </div>
      <div className="mapping-table">
        <div className="table-row header">
          <span>来源</span>
          <span>字段</span>
          <span>本体类</span>
          <span>属性</span>
          <span>状态</span>
          <span>说明</span>
        </div>
        {filtered.map((mapping) => (
          <div className="table-row" key={`${mapping.sourceTable}-${mapping.sourceField}`}>
            <span>{mapping.sourceTable === "main" ? "主表" : "RIP_ROP"}</span>
            <strong>{mapping.sourceField}</strong>
            <span>{mapping.ontologyClass}</span>
            <code>{mapping.ontologyProperty}</code>
            <em className={`status ${statusClass(mapping.status)}`}>{mapping.status}</em>
            <span>{mapping.note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function InstancesView({ dataset, selectedRecord, onSelectRecord }: { dataset: DemoDataset; selectedRecord: ProcessRecord | null; onSelectRecord: (record: ProcessRecord) => void }) {
  const [line, setLine] = useState("全部");
  const [fault, setFault] = useState("全部");
  const lines = ["全部", ...dataset.summary.distributions.line.map((item) => item.name), "RIP_ROP"];
  const faults = ["全部", ...dataset.summary.distributions.fault.map((item) => item.name)];
  const records = dataset.records
    .filter((record) => line === "全部" || record.lineName === line)
    .filter((record) => fault === "全部" || normalizeFault(record.faultCode) === fault)
    .slice(0, 160);

  return (
    <section className="instance-layout">
      <div className="list-pane">
        <div className="toolbar compact-toolbar">
          <select value={line} onChange={(event) => setLine(event.target.value)}>
            {lines.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={fault} onChange={(event) => setFault(event.target.value)}>
            {faults.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div className="record-list">
          {records.map((record) => (
            <button key={record.id} className={selectedRecord?.id === record.id ? "selected" : ""} onClick={() => onSelectRecord(record)}>
              <strong>{record.id}</strong>
              <span>{record.deviceName || "未提供设备"} · {record.program || "未提供程序"}</span>
              <small>{normalizeFault(record.faultCode) || `pre=${record.predictionCategory ?? "-"}`}</small>
            </button>
          ))}
        </div>
      </div>
      <RecordInspector record={selectedRecord} />
    </section>
  );
}

function CurvesView({ dataset, record, onSelectRecord, reasoning }: { dataset: DemoDataset; record: ProcessRecord | null; onSelectRecord: (record: ProcessRecord) => void; reasoning: ReasoningResult | null }) {
  const curveRecords = dataset.records.filter((item) => item.curveSummary?.riveting || item.curveSummary?.original).slice(0, 40);
  const option = useMemo(() => curveOption(record), [record]);

  return (
    <section className="curves-layout">
      <div className="curve-selector">
        <h3>曲线记录</h3>
        {curveRecords.map((item) => (
          <button key={item.id} className={record?.id === item.id ? "selected" : ""} onClick={() => onSelectRecord(item)}>
            <span>{item.id}</span>
            <small>{normalizeFault(item.faultCode) || item.lineName}</small>
          </button>
        ))}
      </div>
      <div className="curve-main">
        <div className="section-heading">
          <h3>{record?.id ?? "未选择记录"}</h3>
          <span>{record?.deviceName} · {record?.program}</span>
        </div>
        <Chart option={option} className="curve-chart" />
        <div className="curve-stats">
          {Object.entries(record?.curveSummary ?? {}).map(([key, value]) => (
            <div key={key}>
              <strong>{curveLabel(key)}</strong>
              <span>{value.pointCount} 点 · 峰值 {value.max} · 均值 {value.avg}</span>
            </div>
          ))}
        </div>
      </div>
      <aside className="inspector">
        <div className="node-badge reasoning">规则解释</div>
        <h2>{normalizeFault(record?.faultCode) || "预测结果复核"}</h2>
        <p>{reasoning?.conclusion}</p>
        <FieldChips fields={reasoning?.triggeredRules ?? []} />
      </aside>
    </section>
  );
}

function ReasoningView({ dataset, record, reasoning, onSelectRecord }: { dataset: DemoDataset; record: ProcessRecord | null; reasoning: ReasoningResult | null; onSelectRecord: (record: ProcessRecord) => void }) {
  const candidates = dataset.records.filter((item) => item.faultCode && item.faultCode !== "-").slice(0, 24);
  return (
    <section className="reasoning-layout">
      <div className="record-list slim">
        {candidates.map((item) => (
          <button key={item.id} className={record?.id === item.id ? "selected" : ""} onClick={() => onSelectRecord(item)}>
            <strong>{item.id}</strong>
            <small>{normalizeFault(item.faultCode)}</small>
          </button>
        ))}
      </div>
      <div className="reasoning-main">
        <div className="rule-flow">
          {(reasoning?.ontologyPath ?? []).map((item, index) => (
            <div key={item} className="flow-node">
              <span>{index + 1}</span>
              <strong>{item}</strong>
            </div>
          ))}
        </div>
        <section className="panel">
          <div className="section-heading">
            <h3>结论</h3>
            <span>{record?.id}</span>
          </div>
          <p className="large-text">{reasoning?.conclusion}</p>
          <FieldChips fields={reasoning?.evidenceFields ?? []} />
        </section>
        <section className="panel">
          <div className="section-heading">
            <h3>三元组</h3>
            <span>RDF-like</span>
          </div>
          <div className="triple-list">
            {reasoning?.triples.map((triple) => (
              <code key={triple.join("-")}>{triple[0]} · {triple[1]} · {triple[2]}</code>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function DemoScriptView({ dataset, onNavigate }: { dataset: DemoDataset; onNavigate: (view: ViewKey) => void }) {
  const [mode, setMode] = useState<"3min" | "5min" | "10min">("5min");
  return (
    <section className="view-stack">
      <div className="toolbar">
        {(["3min", "5min", "10min"] as const).map((item) => (
          <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="script-list">
        {dataset.demoScripts[mode].map((step, index) => (
          <article key={`${step.title}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{step.title}</h3>
              <small>{step.page}</small>
              <p>{step.talkingPoint}</p>
            </div>
          </article>
        ))}
      </div>
      <button className="primary-wide" onClick={() => onNavigate("dashboard")}>
        <BookOpen size={18} />
        从总览开始
      </button>
    </section>
  );
}

function RecordInspector({ record }: { record: ProcessRecord | null }) {
  if (!record) return <aside className="inspector">未选择记录</aside>;
  const path = ["SPR过程记录类", record.deviceName ? "设备类" : null, record.program ? "程序类" : null, record.rivetId ? "SPR连接点类" : null, "SPR曲线数据类", "质量结果类"].filter(Boolean);
  return (
    <aside className="record-inspector">
      <div className="section-heading">
        <h3>{record.id}</h3>
        <span>{record.source === "main" ? "主数据库" : "RIP_ROP"}</span>
      </div>
      <dl className="detail-grid">
        <dt>设备</dt><dd>{record.deviceName ?? "-"}</dd>
        <dt>程序</dt><dd>{record.program ?? "-"}</dd>
        <dt>产线</dt><dd>{record.lineName ?? "-"}</dd>
        <dt>铆点</dt><dd>{record.rivetId ?? "-"}</dd>
        <dt>故障</dt><dd>{normalizeFault(record.faultCode) || "-"}</dd>
        <dt>预测</dt><dd>{record.predictionCategory ?? "-"}</dd>
      </dl>
      <h4>实例化路径</h4>
      <div className="path-line">
        {path.map((item) => <span key={item}>{item}</span>)}
      </div>
      <h4>原始字段</h4>
      <div className="raw-grid">
        {Object.entries(record.raw).slice(0, 18).map(([key, value]) => (
          <div key={key}>
            <span>{key}</span>
            <strong>{String(value).slice(0, 80)}</strong>
          </div>
        ))}
      </div>
    </aside>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: number; compact?: boolean }) {
  return (
    <div className={compact ? "metric compact" : "metric"}>
      <strong>{value.toLocaleString("zh-CN")}</strong>
      <span>{label}</span>
    </div>
  );
}

function FieldChips({ fields }: { fields: string[] }) {
  if (fields.length === 0) return <p className="muted">暂无来源字段</p>;
  return (
    <div className="chips">
      {fields.map((field) => (
        <span key={field}>{field}</span>
      ))}
    </div>
  );
}

function pieOption(data: Array<{ name: string; value: number }>, title: string) {
  return {
    title: { text: title, left: 8, top: 4, textStyle: { fontSize: 14, color: "#172033" } },
    tooltip: { trigger: "item" },
    color: ["#2447a8", "#f28c28", "#d84c5f", "#159a75"],
    series: [{ type: "pie", radius: ["42%", "70%"], center: ["50%", "56%"], data, label: { formatter: "{b}\n{c}" } }]
  };
}

function barOption(data: Array<{ name: string; value: number }>, title: string) {
  return {
    title: { text: title, left: 8, top: 4, textStyle: { fontSize: 14, color: "#172033" } },
    tooltip: {},
    grid: { left: 44, right: 20, top: 54, bottom: 36 },
    xAxis: { type: "category", data: data.map((item) => item.name), axisLabel: { color: "#687386" } },
    yAxis: { type: "value", axisLabel: { color: "#687386" } },
    series: [{ type: "bar", data: data.map((item) => item.value), itemStyle: { color: "#2447a8", borderRadius: [4, 4, 0, 0] } }]
  };
}

function curveOption(record: ProcessRecord | null) {
  const curves = record?.curves ?? {};
  const series = Object.entries(curves)
    .filter(([, values]) => values && values.length > 0)
    .map(([key, values]) => ({
      name: curveLabel(key),
      type: "line",
      showSymbol: false,
      data: values,
      lineStyle: { width: key === "envelope" ? 3 : 2, type: key === "envelope" ? "dashed" : "solid" },
      emphasis: { focus: "series" }
    }));

  return {
    tooltip: { trigger: "axis" },
    legend: { top: 8 },
    grid: { left: 50, right: 24, top: 56, bottom: 34 },
    color: ["#2447a8", "#159a75", "#d84c5f", "#f28c28"],
    xAxis: { type: "category", boundaryGap: false },
    yAxis: { type: "value", scale: true },
    series
  };
}

function curveLabel(key: string): string {
  return {
    original: "原始曲线",
    calculated: "计算后曲线",
    riveting: "铆接曲线",
    envelope: "包络线"
  }[key] ?? key;
}

function normalizeFault(value: string | undefined): string {
  if (!value || value === "-") return "";
  return value.replace(/^DDC:\s*/, "");
}

function statusClass(status: FieldMapping["status"]): string {
  if (status === "需确认") return "warn";
  if (status === "需新增扩展类") return "hot";
  if (status === "需补属性") return "info";
  return "ok";
}
