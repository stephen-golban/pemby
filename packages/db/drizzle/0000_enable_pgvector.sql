-- pgvector for job and profile embeddings (halfvec + HNSW). Railway Postgres 18 ships it.
-- A no-op where the extension already exists.
CREATE EXTENSION IF NOT EXISTS vector;
