import type { ProcessRecord, ReasoningResult } from "../types/demo";

export function explainRecord(record: Pick<ProcessRecord, "id" | "source" | "faultCode" | "errorRate" | "predictionCategory" | "curves">): ReasoningResult {
  const triggeredRules: string[] = [];
  const evidenceFields = new Set<string>();
  const triples: Array<[string, string, string]> = [
    [`过程记录_${record.id}`, "rdf:type", "SPR过程记录类"],
    [`过程记录_${record.id}`, "hasCurveData", `曲线数据_${record.id}`],
    [`过程记录_${record.id}`, "hasQualityResult", `质量结果_${record.id}`]
  ];

  const fault = record.faultCode ?? "";
  if (fault.includes("高于包络线")) {
    triggeredRules.push("Rule-Curve-High");
    evidenceFields.add("故障代码");
    evidenceFields.add("铆接曲线");
    evidenceFields.add("包络线");
    triples.push([`质量结果_${record.id}`, "hasDefect", "铆接曲线高于包络线"]);
  }
  if (fault.includes("低于包络线")) {
    triggeredRules.push("Rule-Curve-Low");
    evidenceFields.add("故障代码");
    evidenceFields.add("铆接曲线");
    evidenceFields.add("包络线");
    triples.push([`质量结果_${record.id}`, "hasDefect", "铆接曲线低于包络线"]);
  }
  if (fault.includes("冲压行程过大")) {
    triggeredRules.push("Rule-Press-Stroke-High");
    evidenceFields.add("故障代码");
    evidenceFields.add("铆接线冲压行程");
    triples.push([`质量结果_${record.id}`, "hasDefect", "冲压行程过大"]);
  }
  if (record.errorRate !== undefined && Number(record.errorRate) > 0.01) {
    triggeredRules.push("Rule-Prediction-Review");
    evidenceFields.add("error_rate");
    evidenceFields.add("pre");
    triples.push([`过程记录_${record.id}`, "hasPredictionResult", `模型预测结果_${record.id}`]);
  }
  if (triggeredRules.length === 0) {
    triggeredRules.push("Rule-No-Blocking-Fault");
    evidenceFields.add(record.source === "main" ? "pre" : record.source === "rip_rop" ? "故障代码" : "原始字段");
  }

  const faultLabel = fault && fault !== "-" ? fault.replace(/^DDC:\s*/, "") : "未触发明确故障";
  return {
    recordId: record.id,
    conclusion:
      faultLabel === "未触发明确故障"
        ? "该记录当前未显示明确故障，保留为可追溯过程记录。"
        : `该记录被解释为“${faultLabel}”，可沿过程记录、曲线数据、包络线、质量结果与缺陷类追溯。`,
    triggeredRules,
    evidenceFields: Array.from(evidenceFields),
    ontologyPath: ["SPR过程记录类", "SPR曲线数据类", "包络线类", "质量结果类", "缺陷类"],
    triples
  };
}
