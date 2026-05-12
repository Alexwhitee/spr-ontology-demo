import demoDataset from "../data/processed/demo-dataset.json";
import { describe, expect, it } from "vitest";
import {
  exportOwlXml,
  extractRuleCandidatesWithLlm,
  runDetection,
  validateOwlXml,
  type DemoDataset
} from "../shared/ontology-service";

const dataset = demoDataset as unknown as DemoDataset;

describe("ontology service LLM and strict OWL behavior", () => {
  it("accepts a chat completions URL and extracts fenced JSON from LLM output", async () => {
    const record = dataset.records[0];
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: "```json\n{\"category\":\"normal\",\"confidence\":0.93,\"severity\":\"normal\",\"evidence\":[\"no blocking fault\"],\"needsReview\":false}\n```"
          }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const detection = await runDetection(dataset, {
      recordId: record.id,
      modelMode: "llm",
      llm: {
        apiBaseUrl: "https://llm.example.com/v1/chat/completions",
        apiKey: "test-key",
        model: "generic-llm",
        fetchImpl: fakeFetch
      }
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://llm.example.com/v1/chat/completions");
    expect(detection.prediction.category).toBe("normal");
    expect(detection.prediction.needsReview).toBe(false);
  });

  it("extracts expert rule candidates through an LLM response before review", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
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
    };

    const extraction = await extractRuleCandidatesWithLlm({
      text: "When the SPR force curve is above envelope for two consecutive points, review parameter set and die wear.",
      sourceDocument: "expert-sop.md",
      llm: {
        apiBaseUrl: "https://llm.example.com/v1",
        apiKey: "test-key",
        model: "generic-llm",
        fetchImpl: fakeFetch
      }
    });

    expect(calls[0].url).toBe("https://llm.example.com/v1/chat/completions");
    expect(String(calls[0].init?.body)).not.toContain("test-key");
    expect(extraction.reviewStatus).toBe("pending");
    expect(extraction.candidates).toHaveLength(1);
    expect(extraction.candidates[0].ruleName).toBe("LLM Seal Review");
    expect(extraction.candidates[0].evidenceFields).toEqual(["faultCode", "curveSummary.envelope"]);
    expect(extraction.candidates[0].reviewStatus).toBe("pending");
  });

  it("validates exported OWL references instead of only counting descriptors", () => {
    const invalidOwl = exportOwlXml(dataset).replace("#SPRInspectionProcess", "#MissingClass");
    const validation = validateOwlXml(invalidOwl);

    expect(validation.success).toBe(false);
    expect(validation.errors.some((error) => error.code === "UNKNOWN_CLASS_REFERENCE")).toBe(true);
  });
});
