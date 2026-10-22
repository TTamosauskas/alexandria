"""Teste local da migração e de substituição de votos D1 (SQLite)."""
import pathlib
import sqlite3

root = pathlib.Path(__file__).resolve().parents[1]
schema = (root / "migrations" / "0001_ratings.sql").read_text(encoding="utf-8")

db = sqlite3.connect(":memory:")
db.executescript(schema)
book = "a" * 64
first = "b" * 64
second = "c" * 64


def cast(voter, score):
    db.execute(
        """
        INSERT INTO rating_votes(book_id, voter_hash, score, updated_at)
        VALUES(?, ?, ?, unixepoch())
        ON CONFLICT(book_id, voter_hash)
        DO UPDATE SET score = excluded.score, updated_at = unixepoch()
        """,
        (book, voter, score),
    )
    db.execute(
        """
        INSERT INTO book_ratings(book_id, score_sum, vote_count)
        SELECT book_id, SUM(score), COUNT(*) FROM rating_votes
        WHERE book_id = ? GROUP BY book_id
        ON CONFLICT(book_id)
        DO UPDATE SET score_sum = excluded.score_sum, vote_count = excluded.vote_count
        """,
        (book,),
    )
    db.commit()


cast(first, 5)
cast(second, 1)
assert db.execute("SELECT score_sum, vote_count FROM book_ratings").fetchone() == (6, 2)
cast(first, 3)
assert db.execute("SELECT score_sum, vote_count FROM book_ratings").fetchone() == (4, 2)
assert db.execute("SELECT COUNT(*) FROM rating_votes").fetchone()[0] == 2
print("Migração e atualização de médias: OK")

# Histórico estritamente limitado a 500 pesquisas, com exclusão na inserção.
history_schema = (root / "migrations" / "0002_search_history.sql").read_text(encoding="utf-8")
db.executescript(history_schema)
for position in range(525):
    db.execute("INSERT INTO search_history (query, category, language) VALUES (?, ?, ?)",
               (f"busca {position}", "", "pt"))
db.commit()
assert db.execute("SELECT COUNT(*) FROM search_history").fetchone()[0] == 500
oldest, newest = db.execute("SELECT MIN(id), MAX(id) FROM search_history").fetchone()
assert newest - oldest == 499
assert db.execute("SELECT query FROM search_history ORDER BY id DESC LIMIT 1").fetchone()[0] == "busca 524"
try:
    db.execute("INSERT INTO search_history (query, category, language) VALUES ('', '', 'pt')")
    assert False, "Pesquisa vazia não deve ser registrada"
except sqlite3.IntegrityError:
    pass
print("Histórico limitado às últimas 500 pesquisas: OK")


# Links sinalizados não armazenam PII e são únicos por URL.
report_schema = (root / "migrations" / "0003_reported_links.sql").read_text(encoding="utf-8")
db.executescript(report_schema)
archive_link = "https://archive.org/download/example/file.pdf"
db.execute("INSERT INTO reported_links (pdf_url, title) VALUES (?, ?)", (archive_link, "Livro"))
db.execute("INSERT INTO reported_links (pdf_url, title) VALUES (?, ?) ON CONFLICT(pdf_url) DO NOTHING",
           (archive_link, "Livro"))
assert db.execute("SELECT COUNT(*) FROM reported_links").fetchone()[0] == 1
columns = [row[1] for row in db.execute("PRAGMA table_info(reported_links)")]
assert set(columns) == {"pdf_url", "title", "created_at"}
print("Sinalizações de links, sem dados pessoais: OK")
