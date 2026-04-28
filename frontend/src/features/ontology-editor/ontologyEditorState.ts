import {
  applyOntologyOperations,
  deriveOntologyArtifacts,
  type GraphEdge,
  type GraphNode,
  type OntologyDocument,
  type SprOntologyLayer,
  type TopOntologyStatus
} from "../../../../shared/ontology";

export type EditorMode = "top" | "spr" | "mapping" | "overview";

export type SelectedNodeDraft = {
  kind: "top" | "spr";
  id: string;
  name: string;
  definition: string;
  domain: string;
  parentId: string;
  parentTopId: string;
  layer: SprOntologyLayer;
  status: TopOntologyStatus;
};

export function createSelectedNodeDraft(document: OntologyDocument, id: string): SelectedNodeDraft {
  const topNode = document.top_ontology.nodes[id];
  if (topNode) {
    return {
      kind: "top",
      id: topNode.id,
      name: topNode.name,
      definition: topNode.definition,
      domain: topNode.domain,
      parentId: topNode.parent_id ?? "",
      parentTopId: "",
      layer: "spr-extension",
      status: topNode.status
    };
  }

  const sprNode = document.spr_ontology.nodes[id];
  if (!sprNode) throw new Error(`节点不存在：${id}`);
  return {
    kind: "spr",
    id: sprNode.id,
    name: sprNode.name,
    definition: sprNode.definition,
    domain: "",
    parentId: "",
    parentTopId: sprNode.parent_top_id,
    layer: sprNode.layer,
    status: "candidate"
  };
}

export function applySelectedNodeDraft(document: OntologyDocument, draft: SelectedNodeDraft): OntologyDocument {
  if (draft.kind === "top") {
    return applyOntologyOperations(document, [{
      type: "updateNode",
      id: draft.id,
      patch: {
        name: draft.name,
        definition: draft.definition,
        domain: draft.domain,
        parent_id: draft.parentId || null,
        status: draft.status
      }
    }]);
  }

  return applyOntologyOperations(document, [{
    type: "updateNode",
    id: draft.id,
    patch: {
      name: draft.name,
      definition: draft.definition,
      parent_top_id: draft.parentTopId,
      layer: draft.layer
    }
  }]);
}

export function removeSelectedNode(document: OntologyDocument, id: string): OntologyDocument {
  return applyOntologyOperations(document, [{ type: "deleteNode", id, cascade: true }]);
}

export function getEditorGraph(document: OntologyDocument, mode: EditorMode): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (mode === "overview") return deriveOntologyArtifacts(document).ontology;
  if (mode === "top") return buildTopOnlyGraph(document);
  if (mode === "spr") return buildSprOnlyGraph(document);
  return buildMappingOnlyGraph(document);
}

function buildTopOnlyGraph(document: OntologyDocument): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return {
    nodes: Object.values(document.top_ontology.nodes).map((node) => ({
      id: node.id,
      label: node.name,
      type: "class",
      group: "top",
      description: node.definition,
      status: node.status
    })),
    edges: Object.values(document.top_ontology.nodes)
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

function buildSprOnlyGraph(document: OntologyDocument): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return {
    nodes: Object.values(document.spr_ontology.nodes).map((node) => ({
      id: node.id,
      label: node.name,
      type: node.layer === "spr-rule" ? "rule" : "class",
      group: node.layer === "spr-core" ? "spr-core" : node.layer === "spr-rule" ? "reasoning" : "spr-extension",
      description: node.definition,
      sourceFields: node.source_fields,
      instanceCount: node.instanceCount
    })),
    edges: document.spr_ontology.relations.map((relation) => ({
      id: relation.id,
      source: relation.source,
      target: relation.target,
      label: relation.label,
      type: relation.type === "subclass-of" ? "inherits" : relation.type
    }))
  };
}

function buildMappingOnlyGraph(document: OntologyDocument): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const mappedTopIds = new Set(document.top_spr_mappings.map((mapping) => mapping.top_id));
  const mappedSprIds = new Set(document.top_spr_mappings.map((mapping) => mapping.spr_id));
  return {
    nodes: [
      ...Object.values(document.top_ontology.nodes)
        .filter((node) => mappedTopIds.has(node.id))
        .map((node) => ({
          id: node.id,
          label: node.name,
          type: "class" as const,
          group: "top" as const,
          description: node.definition,
          status: node.status
        })),
      ...Object.values(document.spr_ontology.nodes)
        .filter((node) => mappedSprIds.has(node.id))
        .map((node) => ({
          id: node.id,
          label: node.name,
          type: node.layer === "spr-rule" ? "rule" as const : "class" as const,
          group: node.layer === "spr-core" ? "spr-core" as const : node.layer === "spr-rule" ? "reasoning" as const : "spr-extension" as const,
          description: node.definition,
          sourceFields: node.source_fields,
          instanceCount: node.instanceCount
        }))
    ],
    edges: document.top_spr_mappings.map((mapping) => ({
      id: `mapping-${mapping.id}`,
      source: mapping.top_id,
      target: mapping.spr_id,
      label: mapping.relation,
      type: "inherits"
    }))
  };
}
