CREATE TABLE IF NOT EXISTS ontology_versions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  message TEXT NOT NULL,
  object_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ontology_current (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  version_id TEXT NOT NULL
);
