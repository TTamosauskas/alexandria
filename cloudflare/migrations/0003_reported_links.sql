-- Sinalizações feitas por visitantes; não são comprovação de infração.
-- Nenhuma informação pessoal ou conteúdo do e-mail é armazenado.
CREATE TABLE IF NOT EXISTS reported_links (
  pdf_url TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (length(pdf_url) <= 1800),
  CHECK (length(title) BETWEEN 1 AND 300)
);
CREATE INDEX IF NOT EXISTS idx_reported_links_date ON reported_links(created_at DESC);
