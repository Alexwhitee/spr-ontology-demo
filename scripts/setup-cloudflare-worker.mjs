import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const wranglerConfigPath = resolve(root, "backend", "wrangler.toml");
const databaseName = "spr_ontology_versions";

try {
  main();
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function main() {
  assertAuthenticated();
  ensureD1Database();
  applyD1Migrations();
  putAdminTokenIfProvided();
  console.log("\nCloudflare Worker resources are ready.");
  console.log("Next: npm run cf:deploy:worker");
}

function assertAuthenticated() {
  const result = run(["wrangler", "whoami"], { allowFailure: true });
  if (result.status !== 0 || result.stdout.includes("not authenticated") || result.stderr.includes("not authenticated")) {
    throw new Error("Wrangler is not authenticated. Run: npx wrangler login");
  }
}

function ensureD1Database() {
  const config = readConfig();
  const currentId = readDatabaseId(config);
  if (currentId && currentId !== "replace-with-cloudflare-d1-database-id") {
    console.log(`D1 database already configured: ${currentId}`);
    return;
  }

  const result = run(["wrangler", "d1", "create", databaseName], { allowFailure: true });
  const output = `${result.stdout}\n${result.stderr}`;
  const databaseId =
    output.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ??
    output.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1] ??
    output.match(/database_id:\s*([\w-]+)/)?.[1];
  if (!databaseId) {
    if (output.includes("already exists")) {
      throw new Error(`D1 database ${databaseName} already exists but database_id could not be read. Run "npx wrangler d1 list" and paste its id into backend/wrangler.toml.`);
    }
    throw new Error(`Unable to create D1 database.\n${output}`);
  }

  writeConfig(config.replace(/database_id\s*=\s*"[^"]+"/, `database_id = "${databaseId}"`));
  console.log(`Configured D1 database_id: ${databaseId}`);
}

function applyD1Migrations() {
  run(["wrangler", "d1", "migrations", "apply", databaseName, "--remote", "--config", "backend/wrangler.toml"]);
}

function putAdminTokenIfProvided() {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    console.log("ADMIN_TOKEN was not provided. If this is the first deploy, run:");
    console.log("  ADMIN_TOKEN='<your-token>' npm run cf:setup");
    return;
  }
  run(["wrangler", "secret", "put", "ADMIN_TOKEN", "--config", "backend/wrangler.toml"], { input: `${token}\n` });
  console.log("ADMIN_TOKEN secret configured.");
}

function readConfig() {
  return readFileSync(wranglerConfigPath, "utf8");
}

function writeConfig(value) {
  writeFileSync(wranglerConfigPath, value, "utf8");
}

function readDatabaseId(config) {
  return config.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ?? null;
}

function run(args, options = {}) {
  const [binary, ...rest] = args;
  const command = binary === "wrangler" ? "npx" : binary;
  const commandArgs = binary === "wrangler" ? ["wrangler", ...rest] : rest;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    input: options.input,
    stdio: options.input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"]
  });
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
  return result;
}
