CREATE TABLE IF NOT EXISTS ontology_versions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  message TEXT NOT NULL,
  object_key TEXT,
  document_json TEXT
);

CREATE TABLE IF NOT EXISTS ontology_current (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  version_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_rule_candidates (
  id TEXT PRIMARY KEY,
  source_document TEXT NOT NULL,
  source_excerpt TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  applicable_process TEXT NOT NULL,
  trigger_condition TEXT NOT NULL,
  defect_pattern TEXT NOT NULL,
  root_cause_candidate TEXT NOT NULL,
  evidence_fields_json TEXT NOT NULL,
  recommended_actions_json TEXT NOT NULL,
  review_status TEXT NOT NULL,
  confidence REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_version_id TEXT
);
