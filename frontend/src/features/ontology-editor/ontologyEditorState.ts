import { applyOntologyOperations, type OntologyDocument, type SprOntologyLayer, type TopOntologyStatus } from "../../../../shared/ontology";

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
