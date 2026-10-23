/**
 * DuckDB schema for the model library.
 *
 * All statements are idempotent (IF NOT EXISTS) so the migration runner
 * can be executed safely more than once.
 */

/**
 * Embedding dimension used across the database. Must match the embedding
 * provider output. If the provider changes dimensions, a migration or
 * database reset is required.
 */
export const EMBEDDING_DIMENSIONS = 1536

export const CREATE_MODEL_FILES = `
CREATE TABLE IF NOT EXISTS model_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  modified_at TIMESTAMP NOT NULL,
  content_hash TEXT NOT NULL,
  indexed_at TIMESTAMP,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);`

export const CREATE_GEOMETRY_METADATA = `
CREATE TABLE IF NOT EXISTS geometry_metadata (
  model_file_id TEXT PRIMARY KEY,
  width_mm DOUBLE,
  height_mm DOUBLE,
  depth_mm DOUBLE,
  triangle_count BIGINT,
  vertex_count BIGINT,
  mesh_count BIGINT,
  object_count BIGINT,
  surface_area_mm2 DOUBLE,
  volume_mm3 DOUBLE,
  is_watertight BOOLEAN,
  created_at TIMESTAMP DEFAULT now()
);`

export const CREATE_THREE_MF_METADATA = `
CREATE TABLE IF NOT EXISTS three_mf_metadata (
  model_file_id TEXT PRIMARY KEY,
  object_names TEXT[],
  material_names TEXT[],
  color_values TEXT[],
  has_thumbnail BOOLEAN,
  thumbnail_internal_path TEXT,
  raw_metadata_json TEXT,
  created_at TIMESTAMP DEFAULT now()
);`

export const CREATE_MODEL_RENDER_ASSETS = `
CREATE TABLE IF NOT EXISTS model_render_assets (
  id TEXT PRIMARY KEY,
  model_file_id TEXT NOT NULL,
  view_name TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);`

export const CREATE_AI_MODEL_DESCRIPTIONS = `
CREATE TABLE IF NOT EXISTS ai_model_descriptions (
  model_file_id TEXT PRIMARY KEY,
  short_name TEXT NOT NULL,
  description TEXT NOT NULL,
  likely_category TEXT NOT NULL,
  tags TEXT[] NOT NULL,
  objects_detected TEXT[] NOT NULL,
  print_use TEXT,
  style TEXT,
  confidence DOUBLE NOT NULL,
  search_phrases TEXT[] NOT NULL,
  raw_response_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);`

export const CREATE_MODEL_EMBEDDINGS = `
CREATE TABLE IF NOT EXISTS model_embeddings (
  model_file_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  embedding FLOAT[${EMBEDDING_DIMENSIONS}],
  source_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);`

export const CREATE_INDEXING_JOBS = `
CREATE TABLE IF NOT EXISTS indexing_jobs (
  id TEXT PRIMARY KEY,
  model_file_id TEXT,
  absolute_path TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);`

export const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_model_files_absolute_path ON model_files (absolute_path);',
  'CREATE INDEX IF NOT EXISTS idx_model_files_content_hash ON model_files (content_hash);',
  'CREATE INDEX IF NOT EXISTS idx_model_files_extension ON model_files (extension);',
  'CREATE INDEX IF NOT EXISTS idx_model_files_status ON model_files (status);',
  'CREATE INDEX IF NOT EXISTS idx_render_assets_model_file ON model_render_assets (model_file_id);',
  'CREATE INDEX IF NOT EXISTS idx_ai_descriptions_category ON ai_model_descriptions (likely_category);',
  'CREATE INDEX IF NOT EXISTS idx_indexing_jobs_status ON indexing_jobs (status);',
]

export const CREATE_HNSW_INDEX = `
CREATE INDEX IF NOT EXISTS idx_model_embeddings_hnsw
ON model_embeddings USING HNSW (embedding)
WITH (metric = 'cosine');`

/**
 * SQLite schema for the model library.
 *
 * Uses TEXT ISO strings for timestamps, INTEGER for bigints/booleans,
 * and JSON text for array properties.
 */

export const SQLITE_CREATE_MODEL_FILES = `
CREATE TABLE IF NOT EXISTS model_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  modified_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  indexed_at TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);`

export const SQLITE_CREATE_GEOMETRY_METADATA = `
CREATE TABLE IF NOT EXISTS geometry_metadata (
  model_file_id TEXT PRIMARY KEY,
  width_mm REAL,
  height_mm REAL,
  depth_mm REAL,
  triangle_count INTEGER,
  vertex_count INTEGER,
  mesh_count INTEGER,
  object_count INTEGER,
  surface_area_mm2 REAL,
  volume_mm3 REAL,
  is_watertight INTEGER,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);`

export const SQLITE_CREATE_THREE_MF_METADATA = `
CREATE TABLE IF NOT EXISTS three_mf_metadata (
  model_file_id TEXT PRIMARY KEY,
  object_names TEXT,
  material_names TEXT,
  color_values TEXT,
  has_thumbnail INTEGER,
  thumbnail_internal_path TEXT,
  raw_metadata_json TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);`

export const SQLITE_CREATE_MODEL_RENDER_ASSETS = `
CREATE TABLE IF NOT EXISTS model_render_assets (
  id TEXT PRIMARY KEY,
  model_file_id TEXT NOT NULL,
  view_name TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);`

export const SQLITE_CREATE_AI_MODEL_DESCRIPTIONS = `
CREATE TABLE IF NOT EXISTS ai_model_descriptions (
  model_file_id TEXT PRIMARY KEY,
  short_name TEXT NOT NULL,
  description TEXT NOT NULL,
  likely_category TEXT NOT NULL,
  tags TEXT NOT NULL,
  objects_detected TEXT NOT NULL,
  print_use TEXT,
  style TEXT,
  confidence REAL NOT NULL,
  search_phrases TEXT NOT NULL,
  raw_response_json TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);`

export const SQLITE_CREATE_MODEL_EMBEDDINGS = `
CREATE TABLE IF NOT EXISTS model_embeddings (
  model_file_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  embedding TEXT,
  source_text TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);`

export const SQLITE_CREATE_INDEXING_JOBS = `
CREATE TABLE IF NOT EXISTS indexing_jobs (
  id TEXT PRIMARY KEY,
  model_file_id TEXT,
  absolute_path TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);`

export const SQLITE_CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_model_files_absolute_path ON model_files (absolute_path);',
  'CREATE INDEX IF NOT EXISTS idx_model_files_content_hash ON model_files (content_hash);',
  'CREATE INDEX IF NOT EXISTS idx_model_files_extension ON model_files (extension);',
  'CREATE INDEX IF NOT EXISTS idx_model_files_status ON model_files (status);',
  'CREATE INDEX IF NOT EXISTS idx_render_assets_model_file ON model_render_assets (model_file_id);',
  'CREATE INDEX IF NOT EXISTS idx_ai_descriptions_category ON ai_model_descriptions (likely_category);',
  'CREATE INDEX IF NOT EXISTS idx_indexing_jobs_status ON indexing_jobs (status);',
]

export const SQLITE_CREATE_SCHEMA_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);`

export const SQLITE_INITIAL_SCHEMA_STATEMENTS = [
  SQLITE_CREATE_SCHEMA_MIGRATIONS,
  SQLITE_CREATE_MODEL_FILES,
  SQLITE_CREATE_GEOMETRY_METADATA,
  SQLITE_CREATE_THREE_MF_METADATA,
  SQLITE_CREATE_MODEL_RENDER_ASSETS,
  SQLITE_CREATE_AI_MODEL_DESCRIPTIONS,
  SQLITE_CREATE_MODEL_EMBEDDINGS,
  SQLITE_CREATE_INDEXING_JOBS,
  ...SQLITE_CREATE_INDEXES,
]

export function getVecTableName(dimensions: number): string {
  return `vec_model_embeddings_${dimensions}`
}

export function buildVecTableSql(dimensions: number): string {
  return `CREATE VIRTUAL TABLE IF NOT EXISTS ${getVecTableName(dimensions)} USING vec0(model_file_id text primary key, embedding float[${dimensions}] distance_metric=cosine);`
}

