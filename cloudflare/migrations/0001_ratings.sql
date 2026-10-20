-- Uma avaliação por livro e identidade anônima do navegador.
-- O voto pode ser alterado; o servidor armazena apenas HMAC do identificador.
CREATE TABLE IF NOT EXISTS rating_votes (
  book_id TEXT NOT NULL CHECK (length(book_id) = 64),
  voter_hash TEXT NOT NULL CHECK (length(voter_hash) = 64),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (book_id, voter_hash)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS book_ratings (
  book_id TEXT PRIMARY KEY NOT NULL CHECK (length(book_id) = 64),
  score_sum INTEGER NOT NULL CHECK (score_sum >= 0),
  vote_count INTEGER NOT NULL CHECK (vote_count >= 0)
);
