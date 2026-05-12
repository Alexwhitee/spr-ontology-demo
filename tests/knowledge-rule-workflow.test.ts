import demoDataset from "../data/processed/demo-dataset.json";
import { describe, expect, it, vi } from "vitest";
import worker from "../backend/src/index";
import type { DemoDataset, OntologyDocument } from "../shared/ontology";

const dataset = demoDataset as unknown as DemoDataset;

type CandidateRow = {
  id: string;
  source_document: string;
  source_excerpt: string;
  rule_name: string;
  applicable_process: string;
  trigger_condition: string;
  defect_pattern: string;
  root_cause_candidate: string;
  evidence_fields_json: string;
  recommended_actions_json: string;
  review_status: string;
  confidence: number | null;
  created_at: string;
  updated_at: string;
  published_version_id: string | null;
};

type MemoryState = {
  currentVersionId: string | null;
  versions: Array<{ id: string; created_at: string; message: string; object_key: string | null; document_json: string | null }>;
  candidates: CandidateRow[];
};

describe("knowledge rule review and publish workflow", () => {
  it("persists LLM-extracted candidates, reviews them, and publishes approved rules into a new ontology version", async () => {
    const env = createKnowledgeEnv();
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (String(url).includes("/chat/completions")) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                candidates: [{
                  ruleName: "LLM Seal Review",
                  applicableProcess: "SPRInspectionProcess",
                  triggerCondition: "Curve force is above envelope for two consecutive points.",
                  defectPattern: "curve_above_envelope",
                  rootCauseCandidate: "Parameter set is too aggressive",
                  evidenceFields: ["faultCode", "curveSummary.envelope"],
                  recommendedActions: ["Review parameter set version", "Check die wear"],
                  sourceExcerpt: "above envelope for two consecutive points",
                  confidence: 0.91
                }]
              })
            }
          }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify(dataset), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const extracted = await worker.fetch(jsonRequest("https://unit.test/api/knowledge/extract-rules", {
      sourceDocument: "expert-sop.md",
      text: "Curve force is above envelope for two consecutive points."
    }), env);
    expect(extracted.status).toBe(200);
    const extractedBody = await extracted.json() as { candidates: Array<{ candidateId: string; ruleName: string; reviewStatus: string }> };
    expect(extractedBody.candidates[0].ruleName).toBe("LLM Seal Review");
    expect(extractedBody.candidates[0].reviewStatus).toBe("pending");

    const candidateId = extractedBody.candidates[0].candidateId;
    const listed = await worker.fetch(new Request("https://unit.test/api/knowledge/rule-candidates"), env);
    const listedBody = await listed.json() as Array<{ candidateId: string; reviewStatus: string }>;
    expect(listedBody.map((item) => item.candidateId)).toContain(candidateId);

    const reviewed = await worker.fetch(authorizedJsonRequest(`https://unit.test/api/knowledge/rule-candidates/${candidateId}/review`, {
      reviewStatus: "approved"
    }, "PATCH"), env);
    expect(reviewed.status).toBe(200);
    expect(((await reviewed.json()) as { reviewStatus: string }).reviewStatus).toBe("approved");

    const published = await worker.fetch(authorizedJsonRequest("https://unit.test/api/knowledge/publish-rules", {
      candidateIds: [candidateId]
    }), env);
    expect(published.status).toBe(200);
    const publishedBody = await published.json() as { versionId: string; publishedRules: Array<{ id: string }>; document: OntologyDocument };
    expect(publishedBody.versionId).toBeTruthy();
    expect(publishedBody.publishedRules[0].id).toMatch(/^rule-/);
    expect(publishedBody.document.spr_ontology.nodes[publishedBody.publishedRules[0].id].layer).toBe("spr-rule");

    const owl = await worker.fetch(new Request("https://unit.test/api/ontology/owl"), env);
    expect(await owl.text()).toContain("LLM Seal Review");
  });
});

function jsonRequest(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function authorizedJsonRequest(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { authorization: "Bearer secret", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function createKnowledgeEnv() {
  const state: MemoryState = {
    currentVersionId: null,
    versions: [],
    candidates: []
  };
  return {
    ALLOWED_ORIGIN: "*",
    ADMIN_TOKEN: "secret",
    DATASET_URL: "https://unit.test/data/demo-dataset.json",
    LLM_API_BASE_URL: "https://llm.example.com/v1/chat/completions",
    LLM_API_KEY: "test-key",
    LLM_MODEL: "generic-llm",
    ONTOLOGY_D1: createKnowledgeD1(state)
  };
}

function createKnowledgeD1(state: MemoryState): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO ontology_versions")) {
                state.versions.unshift({
                  id: String(values[0]),
                  created_at: String(values[1]),
                  message: String(values[2]),
                  object_key: values[3] === null ? null : String(values[3]),
                  document_json: values[4] === null ? null : String(values[4])
                });
              }
              if (sql.includes("INSERT INTO ontology_current")) state.currentVersionId = String(values[0]);
              if (sql.includes("INSERT INTO knowledge_rule_candidates")) {
                state.candidates.unshift({
                  id: String(values[0]),
                  source_document: String(values[1]),
                  source_excerpt: String(values[2]),
                  rule_name: String(values[3]),
                  applicable_process: String(values[4]),
                  trigger_condition: String(values[5]),
                  defect_pattern: String(values[6]),
                  root_cause_candidate: String(values[7]),
                  evidence_fields_json: String(values[8]),
                  recommended_actions_json: String(values[9]),
                  review_status: String(values[10]),
                  confidence: values[11] === null ? null : Number(values[11]),
                  created_at: String(values[12]),
                  updated_at: String(values[13]),
                  published_version_id: values[14] === null ? null : String(values[14])
                });
              }
              if (sql.includes("UPDATE knowledge_rule_candidates SET review_status")) {
                const candidate = state.candidates.find((item) => item.id === values[2]);
                if (candidate) {
                  candidate.review_status = String(values[0]);
                  candidate.updated_at = String(values[1]);
                }
              }
              if (sql.includes("UPDATE knowledge_rule_candidates SET published_version_id")) {
                const candidate = state.candidates.find((item) => item.id === values[2]);
                if (candidate) {
                  candidate.published_version_id = String(values[0]);
                  candidate.updated_at = String(values[1]);
                }
              }
              return { success: true };
            },
            async first<T>() {
              if (sql.includes("FROM ontology_current")) {
                const version = state.versions.find((item) => item.id === state.currentVersionId);
                return (version ? { version_id: version.id, object_key: version.object_key, document_json: version.document_json } : null) as T | null;
              }
              if (sql.includes("FROM ontology_versions WHERE id")) {
                const version = state.versions.find((item) => item.id === values[0]);
                return (version ?? null) as T | null;
              }
              if (sql.includes("FROM knowledge_rule_candidates WHERE id")) {
                return (state.candidates.find((item) => item.id === values[0]) ?? null) as T | null;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes("FROM knowledge_rule_candidates")) return { results: state.candidates as T[] };
              return { results: state.versions as T[] };
            }
          };
        },
        async run() {
          return { success: true };
        }
      };
    }
  } as D1Database;
}
