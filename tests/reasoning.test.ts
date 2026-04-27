import { describe, expect, it } from "vitest";
import { explainRecord, summarizeCurve } from "../scripts/shared/reasoning";

describe("reasoning helpers", () => {
  it("summarizes curve points for indexed records", () => {
    expect(summarizeCurve([1, 3, 2, 4])).toEqual({
      pointCount: 4,
      min: 1,
      max: 4,
      avg: 2.5,
      peakIndex: 3
    });
  });

  it("explains high envelope faults with ontology path and evidence fields", () => {
    const result = explainRecord({
      id: "riprop-2",
      source: "rip_rop",
      faultCode: "DDC: 铆接曲线高于包络线",
      curves: {
        riveting: [1, 5, 9],
        envelope: [1, 4, 6]
      }
    });

    expect(result.triggeredRules).toContain("Rule-Curve-High");
    expect(result.evidenceFields).toContain("故障代码");
    expect(result.ontologyPath).toEqual([
      "SPR过程记录类",
      "SPR曲线数据类",
      "包络线类",
      "质量结果类",
      "缺陷类"
    ]);
  });
});
