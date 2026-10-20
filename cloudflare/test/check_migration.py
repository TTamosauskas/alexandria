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
