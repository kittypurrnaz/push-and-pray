from __future__ import annotations

"""
Persistent learning layer for the Post Event Report Generator.

Every time a dataset is processed, this module records what was found
(metrics, column roles, client profiles, text samples) into a local SQLite
database.  On the next run it surfaces that accumulated knowledge so that:

  - Column detection improves (the system remembers "Overall Experience" is a rating)
  - Claude's prompt includes your real historical benchmarks
  - Client-specific comparisons become possible over time
"""

import sqlite3
import json
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "event_memory.db"


class ContextMemory:

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = str(db_path)
        self._init_db()

    # ── Schema ────────────────────────────────────────────────────────────────

    def _init_db(self):
        ddl = """
        CREATE TABLE IF NOT EXISTS events (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            event_name      TEXT    NOT NULL,
            client_name     TEXT,
            event_date      TEXT,
            extra_context   TEXT,
            created_at      TEXT    DEFAULT (datetime('now'))
        );

        -- Scalar metrics extracted per event (attendance rate, NPS, etc.)
        CREATE TABLE IF NOT EXISTS event_metrics (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id        INTEGER REFERENCES events(id) ON DELETE CASCADE,
            metric_name     TEXT    NOT NULL,
            metric_value    REAL,
            metric_label    TEXT
        );

        -- Column names that were successfully role-classified, accumulated across runs.
        -- seen_count tracks how many times a given (name, role) pair has appeared.
        CREATE TABLE IF NOT EXISTS column_roles (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            raw_name        TEXT    NOT NULL,
            detected_role   TEXT    NOT NULL,   -- checkin | datetime | nps | rating | open_text | demographic
            file_type       TEXT,               -- attendance | survey
            seen_count      INTEGER DEFAULT 1,
            UNIQUE(raw_name, detected_role)
        );

        -- Verbatim open-text samples for qualitative trending
        CREATE TABLE IF NOT EXISTS text_samples (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id        INTEGER REFERENCES events(id) ON DELETE CASCADE,
            column_name     TEXT,
            sample_text     TEXT
        );

        -- Running averages per client (updated in-place after every event)
        CREATE TABLE IF NOT EXISTS client_profiles (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            client_name     TEXT    UNIQUE,
            events_count    INTEGER DEFAULT 0,
            avg_attendance_rate REAL,
            avg_nps             REAL,
            avg_satisfaction    REAL,
            last_updated    TEXT
        );
        """
        with self._conn() as c:
            c.executescript(ddl)

    def _conn(self):
        return sqlite3.connect(self.db_path)

    # ── Learn (called after every successful analysis) ────────────────────────

    def record_event(
        self,
        config: dict,
        attendance_analysis: dict | None,
        survey_analysis: dict | None,
    ) -> int:
        """Persist everything learned from one event run. Returns the new event_id."""
        with self._conn() as c:
            cur = c.execute(
                "INSERT INTO events (event_name, client_name, event_date, extra_context) VALUES (?,?,?,?)",
                (
                    config.get("event_name", ""),
                    config.get("client_name", ""),
                    config.get("event_date", ""),
                    config.get("additional_context", ""),
                ),
            )
            event_id = cur.lastrowid

        self._learn_metrics(event_id, attendance_analysis, survey_analysis)
        self._learn_column_roles(attendance_analysis, survey_analysis)
        self._learn_client_profile(config, attendance_analysis, survey_analysis)

        if survey_analysis:
            self._store_text_samples(event_id, survey_analysis.get("open_text_samples") or {})

        return event_id

    def _learn_metrics(self, event_id: int, att: dict | None, sur: dict | None):
        rows = []

        if att:
            ci = att.get("checkin_analysis") or {}
            for key in ("attendance_rate_pct", "attended", "registered", "no_show"):
                if key in ci:
                    rows.append((event_id, key, ci[key], None))

        if sur:
            nps = sur.get("nps") or {}
            if "nps_score" in nps:
                rows.append((event_id, "nps_score", nps["nps_score"], nps.get("benchmark")))
            for col, stats in (sur.get("ratings") or {}).items():
                if col == "__summary__":
                    continue
                rows.append((event_id, f"rating_mean::{col}", stats.get("mean"), stats.get("performance")))
                rows.append((event_id, f"rating_pct_max::{col}", stats.get("pct_of_max_score"), None))

        if rows:
            with self._conn() as c:
                c.executemany(
                    "INSERT INTO event_metrics (event_id, metric_name, metric_value, metric_label) VALUES (?,?,?,?)",
                    rows,
                )

    def _learn_column_roles(self, att: dict | None, sur: dict | None):
        pairs = []

        if att:
            ci = att.get("checkin_analysis") or {}
            if ci.get("column_used"):
                pairs.append((ci["column_used"], "checkin", "attendance"))
            tp = att.get("time_pattern") or {}
            if tp.get("column_used"):
                pairs.append((tp["column_used"], "datetime", "attendance"))

        if sur:
            nps = sur.get("nps") or {}
            if nps.get("column_used"):
                pairs.append((nps["column_used"], "nps", "survey"))
            for col in (sur.get("ratings") or {}):
                if col != "__summary__":
                    pairs.append((col, "rating", "survey"))
            for col in (sur.get("open_text_samples") or {}):
                pairs.append((col, "open_text", "survey"))
            for col in (sur.get("demographics") or {}):
                pairs.append((col, "demographic", "survey"))

        if not pairs:
            return

        with self._conn() as c:
            for raw, role, ftype in pairs:
                c.execute(
                    """INSERT INTO column_roles (raw_name, detected_role, file_type, seen_count)
                       VALUES (?,?,?,1)
                       ON CONFLICT(raw_name, detected_role)
                       DO UPDATE SET seen_count = seen_count + 1""",
                    (raw, role, ftype),
                )

    def _learn_client_profile(self, config: dict, att: dict | None, sur: dict | None):
        client = (config.get("client_name") or "").strip()
        if not client:
            return

        att_rate, nps_score, avg_sat = None, None, None

        if att:
            att_rate = (att.get("checkin_analysis") or {}).get("attendance_rate_pct")
        if sur:
            nps_score = (sur.get("nps") or {}).get("nps_score")
            ratings = {k: v for k, v in (sur.get("ratings") or {}).items() if k != "__summary__"}
            pcts = [v["pct_of_max_score"] for v in ratings.values() if v.get("pct_of_max_score") is not None]
            avg_sat = round(sum(pcts) / len(pcts), 1) if pcts else None

        def running_avg(old, new, n):
            if new is None:
                return old
            if old is None:
                return new
            return round((old * n + new) / (n + 1), 2)

        with self._conn() as c:
            row = c.execute(
                "SELECT events_count, avg_attendance_rate, avg_nps, avg_satisfaction FROM client_profiles WHERE client_name=?",
                (client,),
            ).fetchone()

            if row is None:
                c.execute(
                    "INSERT INTO client_profiles (client_name, events_count, avg_attendance_rate, avg_nps, avg_satisfaction, last_updated) VALUES (?,1,?,?,?,datetime('now'))",
                    (client, att_rate, nps_score, avg_sat),
                )
            else:
                n = row[0]
                c.execute(
                    """UPDATE client_profiles
                       SET events_count       = events_count + 1,
                           avg_attendance_rate = ?,
                           avg_nps             = ?,
                           avg_satisfaction    = ?,
                           last_updated        = datetime('now')
                       WHERE client_name = ?""",
                    (
                        running_avg(row[1], att_rate, n),
                        running_avg(row[2], nps_score, n),
                        running_avg(row[3], avg_sat, n),
                        client,
                    ),
                )

    def _store_text_samples(self, event_id: int, open_texts: dict):
        rows = [
            (event_id, col, sample)
            for col, data in open_texts.items()
            for sample in (data.get("samples") or [])[:5]
        ]
        if rows:
            with self._conn() as c:
                c.executemany(
                    "INSERT INTO text_samples (event_id, column_name, sample_text) VALUES (?,?,?)",
                    rows,
                )

    # ── Recall (called before each run to build context) ─────────────────────

    def get_context(self, config: dict) -> dict:
        """
        Return accumulated knowledge relevant to the current event.
        Feed this into the Claude prompt and the Data Analyst for richer output.
        """
        client = (config.get("client_name") or "").strip()
        return {
            "total_events_processed": self._event_count(),
            "global_benchmarks": self._global_benchmarks(),
            "client_profile": self._client_profile(client) if client else None,
            "recent_events": self._recent_events(limit=5),
            "known_column_roles": self._known_column_roles(),
        }

    def _event_count(self) -> int:
        with self._conn() as c:
            return c.execute("SELECT COUNT(*) FROM events").fetchone()[0]

    def _global_benchmarks(self) -> dict:
        with self._conn() as c:
            rows = c.execute(
                """SELECT metric_name,
                          ROUND(AVG(metric_value),2) as mean,
                          ROUND(MIN(metric_value),2) as min_val,
                          ROUND(MAX(metric_value),2) as max_val,
                          COUNT(*) as n
                   FROM event_metrics
                   WHERE metric_value IS NOT NULL
                   GROUP BY metric_name"""
            ).fetchall()
        return {
            r[0]: {"your_average": r[1], "your_min": r[2], "your_max": r[3], "sample_size": r[4]}
            for r in rows
        }

    def _client_profile(self, client: str) -> dict | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT client_name, events_count, avg_attendance_rate, avg_nps, avg_satisfaction, last_updated FROM client_profiles WHERE client_name=?",
                (client,),
            ).fetchone()
        if not row:
            return None
        return {
            "client_name": row[0],
            "events_count": row[1],
            "avg_attendance_rate_pct": row[2],
            "avg_nps": row[3],
            "avg_satisfaction_pct_of_max": row[4],
            "last_updated": row[5],
        }

    def _recent_events(self, limit: int = 5) -> list[dict]:
        with self._conn() as c:
            rows = c.execute(
                """SELECT e.event_name, e.client_name, e.event_date, e.created_at,
                          GROUP_CONCAT(em.metric_name || '=' || ROUND(COALESCE(em.metric_value,0),1), '; ')
                   FROM events e
                   LEFT JOIN event_metrics em ON em.event_id = e.id
                   GROUP BY e.id
                   ORDER BY e.created_at DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        return [
            {"event": r[0], "client": r[1], "date": r[2], "processed_at": r[3], "metrics": r[4]}
            for r in rows
        ]

    def _known_column_roles(self) -> dict[str, list]:
        """Column names seen ≥ 2 times with confirmed roles, grouped by role."""
        with self._conn() as c:
            rows = c.execute(
                "SELECT raw_name, detected_role, seen_count FROM column_roles WHERE seen_count >= 2 ORDER BY detected_role, seen_count DESC"
            ).fetchall()
        result: dict[str, list] = {}
        for raw, role, count in rows:
            result.setdefault(role, []).append({"column": raw, "seen": count})
        return result

    # ── Column role hints for DataAnalyst ────────────────────────────────────

    def suggest_roles(self, columns: list[str]) -> dict[str, str]:
        """
        Match incoming column names against learned roles.
        Returns {column_name: role} for any exact (case-insensitive) match.
        """
        with self._conn() as c:
            known = c.execute(
                "SELECT LOWER(raw_name), detected_role, seen_count FROM column_roles ORDER BY seen_count DESC"
            ).fetchall()

        lookup = {r[0]: r[1] for r in known}
        return {col: lookup[col.lower().strip()] for col in columns if col.lower().strip() in lookup}

    # ── UI helpers ────────────────────────────────────────────────────────────

    def summary_stats(self) -> dict:
        with self._conn() as c:
            events = c.execute("SELECT COUNT(*) FROM events").fetchone()[0]
            clients = c.execute(
                "SELECT COUNT(DISTINCT client_name) FROM events WHERE client_name != ''"
            ).fetchone()[0]
            cols = c.execute("SELECT COUNT(*) FROM column_roles").fetchone()[0]
            samples = c.execute("SELECT COUNT(*) FROM text_samples").fetchone()[0]
        return {
            "events_processed": events,
            "unique_clients": clients,
            "column_patterns_learned": cols,
            "text_samples_stored": samples,
        }

    def all_events(self) -> list[dict]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT event_name, client_name, event_date, created_at FROM events ORDER BY created_at DESC"
            ).fetchall()
        return [{"event": r[0], "client": r[1], "date": r[2], "processed_at": r[3]} for r in rows]

    def forget_event(self, event_id: int):
        """Hard-delete one event and all its linked rows (CASCADE)."""
        with self._conn() as c:
            c.execute("DELETE FROM events WHERE id = ?", (event_id,))
