import demoDataset from "../data/processed/demo-dataset.json";
import { describe, expect, it, vi } from "vitest";
import worker from "../backend/src/index";
import { createOntologyDocumentFromDataset, type DemoDataset, type OntologyDocument } from "../shared/ontology";

const dataset = demoDataset as unknown as DemoDataset;

type MemoryEnv = {
  ALLOWED_ORIGIN: string;
  ADMIN_TOKEN: string;
  DATASET_URL: string;
  ONTOLOGY_D1: D1Database;
  ONTOLOGY_BUCKET: R2Bucket;
};

describe("ontology worker editing API", () => {
  it("serves the static ontology document when no cloud version exists", async () => {
    const env = createMemoryEnv();
    stubDatasetFetch();

    const response = await worker.fetch(new Request("https://unit.test/api/ontology/current"), env);
    const body = await response.json() as OntologyDocument;

    expect(response.status).toBe(200);
    expect(body.spr_ontology.nodes.record.name).toBe("SPR过程记录类");
  });

  it("rejects ontology writes without the admin token", async () => {
    const env = createMemoryEnv();
    const document = createOntologyDocumentFromDataset(dataset);

    const response = await worker.fetch(new Request("https://unit.test/api/ontology/import", {
      method: "POST",
      body: JSON.stringify({ document })
    }), env);

    expect(response.status).toBe(401);
  });

  it("imports, lists, patches, and restores ontology versions", async () => {
    const env = createMemoryEnv();
    stubDatasetFetch();
    const document = createOntologyDocumentFromDataset(dataset);
    document.spr_ontology.nodes.record.definition = "导入版本。";

    const imported = await worker.fetch(authorizedRequest("https://unit.test/api/ontology/import", {
      document,
      message: "import test"
    }), env);
    expect(imported.status).toBe(200);
    const importedBody = await imported.json() as { versionId: string };

    const patched = await worker.fetch(authorizedRequest("https://unit.test/api/ontology/operations", {
      baseVersionId: importedBody.versionId,
      message: "patch test",
      operations: [{ type: "updateNode", id: "record", patch: { definition: "操作版本。" } }]
    }, "PATCH"), env);
    expect(patched.status).toBe(200);

    const currentAfterPatch = await worker.fetch(new Request("https://unit.test/api/ontology/current"), env);
    expect(((await currentAfterPatch.json()) as OntologyDocument).spr_ontology.nodes.record.definition).toBe("操作版本。");

    const versions = await worker.fetch(new Request("https://unit.test/api/ontology/versions"), env);
    expect(((await versions.json()) as Array<{ id: string }>)).toHaveLength(2);

    const restored = await worker.fetch(new Request(`https://unit.test/api/ontology/versions/${importedBody.versionId}/restore`, {
      method: "POST",
      headers: { authorization: "Bearer secret" },
      body: JSON.stringify({ message: "restore test" })
    }), env);
    expect(restored.status).toBe(200);

    const currentAfterRestore = await worker.fetch(new Request("https://unit.test/api/ontology/current"), env);
    expect(((await currentAfterRestore.json()) as OntologyDocument).spr_ontology.nodes.record.definition).toBe("导入版本。");
  });
});

function authorizedRequest(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { authorization: "Bearer secret", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function stubDatasetFetch() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(dataset), {
    status: 200,
    headers: { "content-type": "application/json" }
  })));
}

function createMemoryEnv(): MemoryEnv {
  const state = {
    currentVersionId: null as string | null,
    versions: [] as Array<{ id: string; created_at: string; message: string; object_key: string }>
  };
  const objects = new Map<string, string>();
  return {
    ALLOWED_ORIGIN: "*",
    ADMIN_TOKEN: "secret",
    DATASET_URL: "https://unit.test/data/demo-dataset.json",
    ONTOLOGY_D1: createMemoryD1(state),
    ONTOLOGY_BUCKET: createMemoryBucket(objects)
  };
}

function createMemoryD1(state: { currentVersionId: string | null; versions: Array<{ id: string; created_at: string; message: string; object_key: string }> }): D1Database {
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
                  object_key: String(values[3])
                });
              }
              if (sql.includes("INSERT INTO ontology_current")) state.currentVersionId = String(values[0]);
              return { success: true };
            },
            async first<T>() {
              if (sql.includes("FROM ontology_current")) {
                const version = state.versions.find((item) => item.id === state.currentVersionId);
                return (version ? { version_id: version.id, object_key: version.object_key } : null) as T | null;
              }
              if (sql.includes("FROM ontology_versions WHERE id")) {
                const version = state.versions.find((item) => item.id === values[0]);
                return (version ?? null) as T | null;
              }
              return null;
            },
            async all<T>() {
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

function createMemoryBucket(objects: Map<string, string>): R2Bucket {
  return {
    async put(key: string, value: string) {
      objects.set(key, value);
      return null;
    },
    async get(key: string) {
      const value = objects.get(key);
      if (!value) return null;
      return {
        async text() {
          return value;
        },
        async json() {
          return JSON.parse(value);
        }
      } as R2ObjectBody;
    }
  } as R2Bucket;
}
