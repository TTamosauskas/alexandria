-- O acesso por #editor não é autenticação. Os termos são visíveis sem login.
-- Nenhum identificador, cookie ou endereço IP é armazenado nesta tabela.
CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL CHECK (language IN ('pt', 'en', 'es', 'all')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (length(query) <= 160),
  CHECK (length(category) <= 160),
  CHECK (length(trim(query)) > 0 OR length(trim(category)) > 0)
);

-- Cada inserção remove todos os registros fora dos 500 mais recentes,
-- mesmo se várias solicitações chegarem próximas no tempo.
CREATE TRIGGER IF NOT EXISTS search_history_keep_latest_500
AFTER INSERT ON search_history
BEGIN
  DELETE FROM search_history
  WHERE id NOT IN (SELECT id FROM search_history ORDER BY id DESC LIMIT 500);
END;
