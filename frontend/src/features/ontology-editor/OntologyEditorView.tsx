import { useEffect, useMemo, useState } from "react";
import { Download, Plus, RefreshCcw, Save, Trash2, Upload } from "lucide-react";
import { OntologyGraph } from "../../components/OntologyGraph";
import {
  applyRemoteOntologyOperations,
  importOntologyDocument,
  loadCurrentOntologyDocument,
  loadOntologyVersions,
  restoreOntologyVersion
} from "../../lib/data";
import type { DemoDataset, OntologyDocument, SprOntologyLayer, SprOntologyRelation } from "../../types/demo";
import { applyOntologyOperations, createOntologyDocumentFromDataset, deriveOntologyArtifacts, validateOntologyDocument } from "../../../../shared/ontology";
import { applySelectedNodeDraft, createSelectedNodeDraft, removeSelectedNode, type SelectedNodeDraft } from "./ontologyEditorState";

type NewNodeDraft = {
  kind: "top" | "spr";
  id: string;
  name: string;
  parentId: string;
  parentTopId: string;
  layer: SprOntologyLayer;
};

type VersionRow = {
  id: string;
  created_at: string;
  message: string;
  object_key: string;
};

const emptyEdge: SprOntologyRelation = {
  id: "",
  source: "",
  target: "",
  label: "hasRelation",
  type: "objectProperty"
};

export function OntologyEditorView({ dataset }: { dataset: DemoDataset }) {
  const fallbackDocument = useMemo(() => createOntologyDocumentFromDataset(dataset), [dataset]);
  const [document, setDocument] = useState<OntologyDocument>(fallbackDocument);
  const [selectedId, setSelectedId] = useState("record");
  const [selectedDraft, setSelectedDraft] = useState<SelectedNodeDraft>(() => createSelectedNodeDraft(fallbackDocument, "record"));
  const [newNode, setNewNode] = useState<NewNodeDraft>({ kind: "spr", id: "", name: "", parentId: "", parentTopId: "online-process-record", layer: "spr-extension" });
  const [edgeDraft, setEdgeDraft] = useState<SprOntologyRelation>(emptyEdge);
  const [activeEdgeId, setActiveEdgeId] = useState("");
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem("spr-ontology-admin-token") ?? "");
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [message, setMessage] = useState("编辑器已载入本地本体，可上传 JSON 或连接 Worker 云端版本。");
  const [errors, setErrors] = useState<string[]>([]);

  const artifacts = useMemo(() => deriveOntologyArtifacts(document), [document]);
  const selectedEdges = useMemo(
    () => document.spr_ontology.relations.filter((relation) => relation.source === selectedId || relation.target === selectedId),
    [document.spr_ontology.relations, selectedId]
  );

  useEffect(() => {
    loadCurrentOntologyDocument()
      .then((cloudDocument) => {
        setDocument(cloudDocument);
        setSelectedId(cloudDocument.spr_ontology.nodes.record ? "record" : Object.keys(cloudDocument.spr_ontology.nodes)[0] ?? Object.keys(cloudDocument.top_ontology.nodes)[0]);
        setMessage("已载入 Worker 当前本体版本。");
      })
      .catch(() => setMessage("未连接 Worker API，当前使用本地静态本体。"));
    loadVersions();
  }, []);

  useEffect(() => {
    try {
      setSelectedDraft(createSelectedNodeDraft(document, selectedId));
    } catch {
      const nextId = Object.keys(document.spr_ontology.nodes)[0] ?? Object.keys(document.top_ontology.nodes)[0];
      if (nextId) setSelectedId(nextId);
    }
  }, [document, selectedId]);

  useEffect(() => {
    localStorage.setItem("spr-ontology-admin-token", adminToken);
  }, [adminToken]);

  function applyLocal(next: OntologyDocument, nextMessage: string) {
    const validation = validateOntologyDocument(next);
    if (!validation.success || !validation.document) {
      setErrors(validation.errors);
      return;
    }
    setDocument(validation.document);
    setErrors([]);
    setMessage(nextMessage);
  }

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      const validation = validateOntologyDocument(value);
      if (!validation.success || !validation.document) {
        setErrors(validation.errors);
        setMessage("JSON 校验失败，未更新图谱。");
        return;
      }
      setDocument(validation.document);
      setSelectedId(validation.document.spr_ontology.nodes.record ? "record" : Object.keys(validation.document.spr_ontology.nodes)[0]);
      setErrors([]);
      setMessage(`已从 ${file.name} 生成可编辑本体。`);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
      setMessage("JSON 解析失败。");
    }
  }

  function handleApplyNodeDraft() {
    try {
      applyLocal(applySelectedNodeDraft(document, selectedDraft), `已更新节点 ${selectedDraft.id}。`);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    }
  }

  function handleDeleteNode() {
    if (!selectedId || !window.confirm(`级联删除节点 ${selectedId} 及其相关关系/映射？`)) return;
    try {
      applyLocal(removeSelectedNode(document, selectedId), `已级联删除节点 ${selectedId}。`);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    }
  }

  function handleAddNode() {
    if (!newNode.id.trim() || !newNode.name.trim()) {
      setErrors(["新增节点必须填写 id 和名称。"]);
      return;
    }
    try {
      const next = applyOntologyOperations(document, [newNode.kind === "top"
        ? {
            type: "addNode",
            kind: "top",
            node: {
              id: newNode.id.trim(),
              name: newNode.name.trim(),
              domain: newNode.name.trim(),
              parent_id: newNode.parentId || null,
              children: [],
              definition: `${newNode.name.trim()}，由在线编辑器新增。`,
              properties: [],
              source_doc: "online-editor",
              status: "candidate"
            }
          }
        : {
            type: "addNode",
            kind: "spr",
            node: {
              id: newNode.id.trim(),
              name: newNode.name.trim(),
              layer: newNode.layer,
              parent_top_id: newNode.parentTopId,
              inheritance_relation: "candidate-subclass-of",
              definition: `${newNode.name.trim()}，由在线编辑器新增。`,
              source_fields: [],
              properties: [],
              relations: [],
              source_doc: "online-editor"
            }
          }]);
      applyLocal(next, `已新增 ${newNode.kind === "top" ? "顶层" : "SPR"} 节点 ${newNode.id}。`);
      setSelectedId(newNode.id.trim());
      setNewNode({ ...newNode, id: "", name: "" });
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    }
  }

  function handleAddEdge() {
    try {
      const next = applyOntologyOperations(document, [{ type: "addEdge", edge: edgeDraft }]);
      applyLocal(next, `已新增关系 ${edgeDraft.id}。`);
      setActiveEdgeId(edgeDraft.id);
      setEdgeDraft(emptyEdge);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    }
  }

  function handleUpdateEdge() {
    if (!activeEdgeId) return;
    try {
      applyLocal(applyOntologyOperations(document, [{ type: "updateEdge", id: activeEdgeId, patch: edgeDraft }]), `已更新关系 ${activeEdgeId}。`);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    }
  }

  function handleDeleteEdge(id: string) {
    try {
      applyLocal(applyOntologyOperations(document, [{ type: "deleteEdge", id }]), `已删除关系 ${id}。`);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    }
  }

  async function handleSaveCloud() {
    try {
      const result = await importOntologyDocument(document, adminToken, "Save ontology editor snapshot");
      setDocument(result.document);
      setMessage(`已保存云端版本 ${result.versionId}。`);
      await loadVersions();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    }
  }

  async function handleCommitSelectedDraft() {
    try {
      const operation = {
        type: "updateNode" as const,
        id: selectedDraft.id,
        patch: selectedDraft.kind === "top"
          ? { name: selectedDraft.name, definition: selectedDraft.definition, domain: selectedDraft.domain, parent_id: selectedDraft.parentId || null, status: selectedDraft.status }
          : { name: selectedDraft.name, definition: selectedDraft.definition, parent_top_id: selectedDraft.parentTopId, layer: selectedDraft.layer }
      };
      const result = await applyRemoteOntologyOperations([operation], adminToken, `Update node ${selectedDraft.id}`);
      setDocument(result.document);
      setMessage(`已提交操作版本 ${result.versionId}。`);
      await loadVersions();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    }
  }

  async function handleRestore(versionId: string) {
    try {
      const result = await restoreOntologyVersion(versionId, adminToken);
      setDocument(result.document);
      setMessage(`已恢复版本 ${versionId}，新版本为 ${result.versionId}。`);
      await loadVersions();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    }
  }

  async function loadVersions() {
    try {
      setVersions(await loadOntologyVersions());
    } catch {
      setVersions([]);
    }
  }

  function exportJson() {
    const blob = new Blob([`${JSON.stringify(document, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `spr-ontology-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function selectEdge(id: string) {
    const relation = document.spr_ontology.relations.find((item) => item.id === id);
    if (!relation) return;
    setActiveEdgeId(id);
    setEdgeDraft(relation);
  }

  return (
    <section className="ontology-page editor-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">Ontology Editor</span>
          <h2>在线导入、编辑和版本化本体 JSON</h2>
        </div>
        <div className="page-actions">
          <p>{message}</p>
        </div>
      </div>

      <div className="editor-toolbar">
        <label className="icon-text-button">
          <Upload size={16} />
          <span>上传 JSON</span>
          <input type="file" accept="application/json,.json" hidden onChange={(event) => handleUpload(event.target.files?.[0])} />
        </label>
        <button type="button" className="icon-text-button" onClick={exportJson}>
          <Download size={16} />
          <span>导出 JSON</span>
        </button>
        <label className="token-box">
          <span>Admin Token</span>
          <input value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="Bearer token" type="password" />
        </label>
        <button type="button" className="icon-text-button primary-wide" onClick={handleSaveCloud}>
          <Save size={16} />
          <span>保存云端版本</span>
        </button>
      </div>

      {errors.length > 0 && (
        <div className="validation-panel">
          <strong>校验报告</strong>
          {errors.map((error) => <span key={error}>{error}</span>)}
        </div>
      )}

      <div className="editor-grid">
        <OntologyGraph
          nodes={artifacts.ontology.nodes}
          edges={artifacts.ontology.edges}
          selectedId={selectedId}
          highlightedEdgeIds={selectedEdges.map((edge) => edge.id)}
          onSelect={(node) => setSelectedId(node.id)}
        />

        <aside className="inspector editor-inspector">
          <div className={`node-badge ${selectedDraft.kind === "top" ? "top" : selectedDraft.layer}`}>{selectedDraft.kind === "top" ? "顶层节点" : selectedDraft.layer}</div>
          <h2>{selectedDraft.id}</h2>
          <FormText label="名称" value={selectedDraft.name} onChange={(value) => setSelectedDraft({ ...selectedDraft, name: value })} />
          <FormTextarea label="定义" value={selectedDraft.definition} onChange={(value) => setSelectedDraft({ ...selectedDraft, definition: value })} />
          {selectedDraft.kind === "top" ? (
            <>
              <FormText label="领域" value={selectedDraft.domain} onChange={(value) => setSelectedDraft({ ...selectedDraft, domain: value })} />
              <Select label="父节点" value={selectedDraft.parentId} onChange={(value) => setSelectedDraft({ ...selectedDraft, parentId: value })} options={["", ...Object.keys(document.top_ontology.nodes).filter((id) => id !== selectedDraft.id)]} />
              <Select label="状态" value={selectedDraft.status} onChange={(value) => setSelectedDraft({ ...selectedDraft, status: value as SelectedNodeDraft["status"] })} options={["stable", "candidate"]} />
            </>
          ) : (
            <>
              <Select label="顶层父类" value={selectedDraft.parentTopId} onChange={(value) => setSelectedDraft({ ...selectedDraft, parentTopId: value })} options={Object.keys(document.top_ontology.nodes)} />
              <Select label="层级" value={selectedDraft.layer} onChange={(value) => setSelectedDraft({ ...selectedDraft, layer: value as SprOntologyLayer })} options={["spr-core", "spr-extension", "spr-data", "spr-rule"]} />
            </>
          )}
          <div className="button-row">
            <button type="button" onClick={handleApplyNodeDraft}>应用到本地</button>
            <button type="button" onClick={handleCommitSelectedDraft}>提交操作</button>
            <button type="button" className="danger" onClick={handleDeleteNode}><Trash2 size={14} /> 级联删除</button>
          </div>
        </aside>
      </div>

      <div className="detail-tabs editor-panels">
        <section className="panel">
          <div className="section-heading">
            <h3>新增节点</h3>
            <span>{Object.keys(document.top_ontology.nodes).length + Object.keys(document.spr_ontology.nodes).length}</span>
          </div>
          <Select label="类型" value={newNode.kind} onChange={(value) => setNewNode({ ...newNode, kind: value as NewNodeDraft["kind"] })} options={["spr", "top"]} />
          <FormText label="ID" value={newNode.id} onChange={(value) => setNewNode({ ...newNode, id: value })} />
          <FormText label="名称" value={newNode.name} onChange={(value) => setNewNode({ ...newNode, name: value })} />
          {newNode.kind === "top"
            ? <Select label="顶层父节点" value={newNode.parentId} onChange={(value) => setNewNode({ ...newNode, parentId: value })} options={["", ...Object.keys(document.top_ontology.nodes)]} />
            : <Select label="顶层父类" value={newNode.parentTopId} onChange={(value) => setNewNode({ ...newNode, parentTopId: value })} options={Object.keys(document.top_ontology.nodes)} />}
          {newNode.kind === "spr" && <Select label="层级" value={newNode.layer} onChange={(value) => setNewNode({ ...newNode, layer: value as SprOntologyLayer })} options={["spr-core", "spr-extension", "spr-data", "spr-rule"]} />}
          <button type="button" className="icon-text-button" onClick={handleAddNode}><Plus size={16} /> 新增节点</button>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h3>关系 CRUD</h3>
            <span>{document.spr_ontology.relations.length}</span>
          </div>
          <Select label="编辑已有关系" value={activeEdgeId} onChange={selectEdge} options={["", ...document.spr_ontology.relations.map((edge) => edge.id)]} />
          <FormText label="关系 ID" value={edgeDraft.id} onChange={(value) => setEdgeDraft({ ...edgeDraft, id: value })} />
          <Select label="Source" value={edgeDraft.source} onChange={(value) => setEdgeDraft({ ...edgeDraft, source: value })} options={["", ...Object.keys(document.spr_ontology.nodes)]} />
          <Select label="Target" value={edgeDraft.target} onChange={(value) => setEdgeDraft({ ...edgeDraft, target: value })} options={["", ...Object.keys(document.spr_ontology.nodes)]} />
          <FormText label="Label" value={edgeDraft.label} onChange={(value) => setEdgeDraft({ ...edgeDraft, label: value })} />
          <Select label="Type" value={edgeDraft.type} onChange={(value) => setEdgeDraft({ ...edgeDraft, type: value as SprOntologyRelation["type"] })} options={["objectProperty", "dataProperty", "derivedFrom", "mapsTo", "inherits", "subclass-of"]} />
          <div className="button-row">
            <button type="button" onClick={handleAddEdge}>新增关系</button>
            <button type="button" onClick={handleUpdateEdge}>更新关系</button>
          </div>
          <div className="relation-list compact">
            {selectedEdges.map((edge) => (
              <div key={edge.id}>
                {edge.source} → <strong>{edge.label}</strong> → {edge.target}
                <button type="button" onClick={() => handleDeleteEdge(edge.id)}>删除</button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h3>云端版本</h3>
            <button type="button" onClick={loadVersions}><RefreshCcw size={14} /></button>
          </div>
          <div className="version-list">
            {versions.length === 0 && <p className="muted">暂无云端版本或未连接 Worker。</p>}
            {versions.map((version) => (
              <div key={version.id}>
                <strong>{version.message}</strong>
                <span>{new Date(version.created_at).toLocaleString("zh-CN")}</span>
                <button type="button" onClick={() => handleRestore(version.id)}>恢复</button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function FormText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="form-line">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function FormTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="form-line">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="form-line">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option || "(empty)"} value={option}>{option || "无"}</option>)}
      </select>
    </label>
  );
}
