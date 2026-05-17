import demoDataset from "../data/processed/demo-dataset.json";
import { describe, expect, it } from "vitest";
import {
  importDatabaseRows,
  type DatabaseImportRequest,
  type DemoDataset
} from "../shared/ontology";
import { runDetection } from "../shared/ontology-service";

const dataset = demoDataset as unknown as DemoDataset;

describe("database import automation", () => {
  it("adds a new RIP_ROP database row and refreshes records, metrics, ontology counts, mappings, and detection inputs", async () => {
    const request: DatabaseImportRequest = {
      sourceTable: "rip_rop",
      rows: [{
        "实物编号": "auto-9001",
        Devicename: "RIVETER-AUTO-01",
        "车身标识": "BODY-AUTO-01",
        "日期/时间": "2026/5/17 12:00:00",
        "输出": "1",
        "程序": "NietProg.Auto",
        "流程类型": "冲铆",
        "铆钉计数器": "AUTO-42",
        "故障代码": "DDC: 铆接曲线高于包络线",
        "铆接曲线": "1,2,6,9,12",
        "包络线": "1,2,3,4,5",
        "RRC启用": "是",
        "Actual end force": "8.2"
      }]
    };

    const result = importDatabaseRows(dataset, request);
    const next = result.dataset;
    const imported = next.records.find((record) => record.id === "riprop-auto-9001");

    expect(result.importedRecordIds).toEqual(["riprop-auto-9001"]);
    expect(result.automationSteps.map((step) => step.status)).toEqual(["done", "done", "done", "done", "done"]);
    expect(next.records).toHaveLength(dataset.records.length + 1);
    expect(next.summary.metrics.ripRopRecords).toBe(dataset.summary.metrics.ripRopRecords + 1);
    expect(next.spr_ontology.nodes.record.instanceCount).toBe(dataset.records.length + 1);
    expect(next.spr_ontology.nodes.device.instanceCount).toBeGreaterThan(dataset.spr_ontology.nodes.device.instanceCount ?? 0);
    expect(next.fieldMappings.some((mapping) => mapping.sourceTable === "rip_rop" && mapping.sourceField === "Actual end force")).toBe(true);
    expect(imported?.curveSummary?.riveting?.pointCount).toBe(5);
    expect(imported?.raw["故障代码"]).toBe("DDC: 铆接曲线高于包络线");

    const detection = await runDetection(next, { recordId: "riprop-auto-9001", modelMode: "mock", includeCurveSummary: true });

    expect(detection.prediction.category).toBe("curve_above_envelope");
    expect(detection.ontologyPath).toContain("AnomalyEvent");
  });

  it("creates conservative field mappings for unknown fields in newly imported tables", () => {
    const result = importDatabaseRows(dataset, {
      sourceTable: "main",
      rows: [{
        id: "auto-main-1",
        prog_no: "P-AUTO",
        rivet_id: "R-AUTO",
        line_name: "LINE-AUTO",
        device_name: "DEVICE-AUTO",
        original_data: "1,2,3",
        calculate_data: "1,2,4",
        error_rate: 0.22,
        pre: "NG",
        new_sensor_score: 98
      }]
    });

    expect(result.dataset.records.some((record) => record.id === "main-auto-main-1")).toBe(true);
    expect(result.dataset.fieldMappings).toContainEqual(expect.objectContaining({
      sourceTable: "main",
      sourceField: "new_sensor_score",
      ontologyClass: "SPR过程记录类",
      status: "需确认"
    }));
    expect(result.automationSteps.find((step) => step.key === "ontology")?.detail).toContain("字段映射");
  });

  it("can run as a browser-local refresh without a worker write", () => {
    const result = importDatabaseRows(dataset, {
      sourceTable: "rip_rop",
      rows: [{ "实物编号": "local-1", "故障代码": "DDC: 冲压行程过大" }]
    });

    expect(result.importedRecordIds).toEqual(["riprop-local-1"]);
    expect(result.dataset.records.some((record) => record.id === "riprop-local-1")).toBe(true);
    expect(result.automationSteps.at(-1)?.detail).toContain("已可进入检测");
  });
});
