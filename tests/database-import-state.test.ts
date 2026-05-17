import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildImportGuidance,
  buildImportRequestDraft,
  databaseSourceOptions,
  defaultImportPayload,
  inferSourceTableFromRows,
  parseExcelWorkbook,
  parseImportText,
  normalizeImportPayload
} from "../frontend/src/app/databaseImportState";

describe("database import presentation state", () => {
  it("explains that main and RIP_ROP are source tables in one business dataset", () => {
    expect(databaseSourceOptions.map((option) => option.value)).toEqual(["rip_rop", "main"]);
    expect(databaseSourceOptions[0].label).toContain("RIP_ROP 表");
    expect(databaseSourceOptions[0].description).toContain("铆接过程");
    expect(databaseSourceOptions[1].label).toContain("main 主表");
    expect(databaseSourceOptions[1].description).toContain("pre");

    const guidance = buildImportGuidance("row", "rip_rop");
    expect(guidance.databaseMeaning).toContain("同一个业务数据库");
    expect(guidance.tableMeaning).toContain("必须选择目标表");
    expect(guidance.payloadMeaning).toContain("JSON 对象");

    const tableGuidance = buildImportGuidance("table", "rip_rop");
    expect(tableGuidance.tableMeaning).toContain("不需要先选择目标来源表");
    expect(tableGuidance.payloadMeaning).toContain("Excel、CSV 或 SQL");
  });

  it("normalizes a single-row JSON object and a full-table JSON array by import mode", () => {
    expect(normalizeImportPayload(defaultImportPayload("row", "rip_rop"), "row")).toHaveLength(1);
    expect(normalizeImportPayload(defaultImportPayload("table", "main"), "table")).toHaveLength(2);
    expect(() => normalizeImportPayload("{\"id\":\"one\"}", "table")).toThrow("JSON 数组");
    expect(() => normalizeImportPayload("[{\"id\":\"one\"},{\"id\":\"two\"}]", "row")).toThrow("一条数据库行");
  });

  it("auto-detects source table from CSV and SQL full-table imports", () => {
    const csv = [
      "实物编号,Devicename,日期/时间,故障代码,铆接曲线,包络线",
      "csv-001,RIVETER-CSV,2026/5/17 12:00:00,DDC: 铆接曲线高于包络线,\"1,2,6\",\"1,2,3\""
    ].join("\n");
    const parsedCsv = parseImportText(csv, "csv", "table");

    expect(parsedCsv.rows).toHaveLength(1);
    expect(parsedCsv.detectedSourceTable).toBe("rip_rop");
    expect(parsedCsv.detectionReason).toContain("故障代码");
    expect(parsedCsv.columns).toContain("铆接曲线");

    const sql = "INSERT INTO main (id, prog_no, rivet_id, line_name, device_name, original_data, calculate_data, error_rate, pre) VALUES ('sql-001', 'P-01', 'R-01', 'RC', 'RC050R02', '1,2,3', '1,2,4', 0.03, '3.000');";
    const parsedSql = parseImportText(sql, "sql", "table");

    expect(parsedSql.rows).toHaveLength(1);
    expect(parsedSql.detectedSourceTable).toBe("main");
    expect(parsedSql.tableName).toBe("main");
    expect(parsedSql.rows[0].pre).toBe("3.000");
  });

  it("parses multiple same-table SQL INSERT statements from one file", () => {
    const sql = [
      "-- exported rows",
      "INSERT INTO `factory`.`main` (id, prog_no, rivet_id, line_name, device_name, original_data, calculate_data, error_rate, pre) VALUES ('sql-101', 'P-01', 'R-01', 'RC', 'RC050R02', '1,2,3', '1,2,4', 0.03, '3.000');",
      "INSERT INTO `factory`.`main` (id, prog_no, rivet_id, line_name, device_name, original_data, calculate_data, error_rate, pre) VALUES ('sql-102', 'P-02', 'R-02', 'RC', 'RC050R03', '2,3,4', '2,3,5', 0.01, '1.000');"
    ].join("\n");
    const parsedSql = parseImportText(sql, "sql", "table");

    expect(parsedSql.tableName).toBe("main");
    expect(parsedSql.rows).toHaveLength(2);
    expect(parsedSql.detectedSourceTable).toBe("main");
  });

  it("reads Excel workbooks and infers the table source from sheet data", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ note: "说明页" }]), "说明");
    const worksheet = XLSX.utils.json_to_sheet([
      {
        "实物编号": "xlsx-001",
        Devicename: "RIVETER-XLSX",
        "日期/时间": "2026/5/17 12:00:00",
        "故障代码": "DDC: 测得得冲压行程过大",
        "铆接曲线": "1,2,3",
        "包络线": "1,2,4"
      }
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "RIP_ROP");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Uint8Array;
    const parsedExcel = parseExcelWorkbook(buffer);

    expect(parsedExcel.rows).toHaveLength(1);
    expect(parsedExcel.detectedSourceTable).toBe("rip_rop");
    expect(parsedExcel.tableName).toBe("RIP_ROP");
    expect(parsedExcel.columns).toContain("故障代码");
  });

  it("returns no automatic source when full-table fields are ambiguous", () => {
    const detection = inferSourceTableFromRows([{ foo: "bar", note: "unknown" }]);

    expect(detection.sourceTable).toBeNull();
    expect(detection.reason).toContain("未能自动识别");
  });

  it("uses detected source table for pasted full-table SQL and only falls back when ambiguous", () => {
    const mainSql = "INSERT INTO main (id, prog_no, rivet_id, line_name, device_name, original_data, calculate_data, error_rate, pre) VALUES ('sql-002', 'P-02', 'R-02', 'RC', 'RC050R03', '1,2,3', '1,2,4', 0.02, '1.000');";
    const detected = buildImportRequestDraft({
      mode: "table",
      fallbackSourceTable: "rip_rop",
      textPayload: mainSql,
      textFormat: "sql"
    });

    expect(detected.sourceTable).toBe("main");
    expect(detected.rows[0].pre).toBe("1.000");

    const fallback = buildImportRequestDraft({
      mode: "table",
      fallbackSourceTable: "rip_rop",
      textPayload: "[{\"unknown\":\"value\"}]",
      textFormat: "json"
    });

    expect(fallback.sourceTable).toBe("rip_rop");
    expect(fallback.detectedSourceTable).toBeNull();
  });

  it("rejects empty table files with beginner-friendly errors", () => {
    expect(() => parseImportText("id,prog_no", "csv", "table")).toThrow("只有表头");
    expect(() => parseImportText("-- no rows", "sql", "table")).toThrow("没有找到 INSERT INTO");
  });
});
