CREATE TABLE IF NOT EXISTS org_nodes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('company', 'department', 'team', 'employee')),
  parent_id TEXT REFERENCES org_nodes(id),
  department_id TEXT REFERENCES org_nodes(id),
  role TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  dataset TEXT NOT NULL CHECK (dataset = 'demo-v1'),
  CHECK (id <> parent_id)
);
CREATE INDEX IF NOT EXISTS org_nodes_department_kind ON org_nodes(department_id, kind);
CREATE INDEX IF NOT EXISTS org_nodes_parent ON org_nodes(parent_id);
CREATE INDEX IF NOT EXISTS org_nodes_kind ON org_nodes(kind);
