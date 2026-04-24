from __future__ import annotations

import pandas as pd
import numpy as np
from typing import Any


class DataAnalyst:
    """
    Analyses cleaned DataFrames and produces a structured findings dict
    that supplements the raw summary for the report generator.

    Pass a ContextMemory instance so the analyst can supplement its built-in
    keyword lists with column roles learned from past datasets.
    """

    # ── Default column keyword hints (extended at runtime from memory) ────────

    NPS_KEYWORDS = ["nps", "recommend", "likelihood", "likely to recommend"]
    RATING_KEYWORDS = ["rating", "score", "satisfaction", "rate", "stars", "scale", "quality"]
    OPEN_TEXT_KEYWORDS = ["comment", "feedback", "suggest", "other", "note", "tell us", "describe", "why"]
    DEMO_KEYWORDS = ["gender", "age", "country", "region", "industry", "company", "job", "title", "role", "seniority"]
    DATE_KEYWORDS = ["date", "time", "timestamp", "registered", "checked", "joined"]
    CHECKIN_KEYWORDS = ["check", "attend", "present", "joined", "scanned", "arrived"]

    def __init__(self, memory=None):
        """
        memory: optional ContextMemory instance.
        When provided, learned column roles supplement keyword detection.
        """
        self._memory = memory

    def _memory_roles(self, columns: list[str]) -> dict[str, str]:
        if self._memory is None:
            return {}
        try:
            return self._memory.suggest_roles(columns)
        except Exception:
            return {}

    # ── Public entry points ───────────────────────────────────────────────────

    def analyse_attendance(self, df: pd.DataFrame) -> dict:
        findings: dict[str, Any] = {"type": "attendance"}

        learned = self._memory_roles(list(df.columns))
        findings["memory_hints_applied"] = learned

        findings["volume"] = self._volume(df)
        findings["checkin_analysis"] = self._checkin_analysis(df, learned)
        findings["demographics"] = self._demographics(df, learned)
        findings["time_pattern"] = self._time_pattern(df, learned)
        findings["data_quality"] = self._data_quality(df)

        return findings

    def analyse_survey(self, df: pd.DataFrame) -> dict:
        findings: dict[str, Any] = {"type": "survey"}

        learned = self._memory_roles(list(df.columns))
        findings["memory_hints_applied"] = learned

        findings["response_rate_note"] = "Response count represents survey respondents only."
        findings["nps"] = self._nps(df, learned)
        findings["ratings"] = self._ratings(df, learned)
        findings["open_text_samples"] = self._open_text_samples(df, learned)
        findings["demographics"] = self._demographics(df, learned)
        findings["correlations"] = self._correlations(df)
        findings["data_quality"] = self._data_quality(df)

        return findings

    # ── Volume ────────────────────────────────────────────────────────────────

    def _volume(self, df: pd.DataFrame) -> dict:
        return {
            "total_records": len(df),
            "complete_records": int(df.dropna(how="any").shape[0]),
            "columns": list(df.columns),
        }

    # ── Check-in / attendance rate ────────────────────────────────────────────

    def _checkin_analysis(self, df: pd.DataFrame, learned: dict = None) -> dict | None:
        checkin_col = self._find_col_with_memory(df, self.CHECKIN_KEYWORDS, "checkin", learned or {})
        if checkin_col is None:
            return None

        col = df[checkin_col]
        if pd.api.types.is_datetime64_any_dtype(col):
            attended = int(col.notna().sum())
        else:
            attended = int(
                col.astype(str).str.lower().isin(["yes", "true", "1", "attended", "present"]).sum()
            )

        total = len(df)
        no_show = total - attended
        rate = round(attended / max(total, 1) * 100, 1)

        result = {
            "column_used": checkin_col,
            "registered": total,
            "attended": attended,
            "no_show": no_show,
            "attendance_rate_pct": rate,
            "insight": self._attendance_insight(rate),
        }

        # hourly check-in pattern if col is datetime
        if pd.api.types.is_datetime64_any_dtype(col):
            hourly = col.dt.hour.value_counts().sort_index()
            if not hourly.empty:
                peak_hour = int(hourly.idxmax())
                result["peak_checkin_hour"] = f"{peak_hour:02d}:00"
                result["hourly_distribution"] = {f"{h:02d}:00": int(c) for h, c in hourly.items()}

        return result

    @staticmethod
    def _attendance_insight(rate: float) -> str:
        if rate >= 90:
            return "Exceptional attendance — virtually all registrants showed up."
        if rate >= 75:
            return "Strong attendance rate, above industry average (~70-75%)."
        if rate >= 60:
            return "Moderate attendance; consider reminder strategies for future events."
        return "Below-average attendance; worth investigating drop-off causes."

    # ── NPS ───────────────────────────────────────────────────────────────────

    def _nps(self, df: pd.DataFrame, learned: dict = None) -> dict | None:
        col_name = self._find_col_with_memory(df, self.NPS_KEYWORDS, "nps", learned or {}, numeric_only=True)
        if col_name is None:
            return None

        col = pd.to_numeric(df[col_name], errors="coerce").dropna()
        if col.empty:
            return None

        max_val = col.max()
        # normalise to 0-10 scale if it's 1-10 or 0-10
        if max_val <= 10:
            promoters = int((col >= 9).sum())
            passives = int(((col >= 7) & (col < 9)).sum())
            detractors = int((col < 7).sum())
        else:
            return {"note": f"NPS column '{col_name}' has max={max_val}; cannot auto-classify."}

        total = len(col)
        nps_score = round((promoters - detractors) / max(total, 1) * 100, 1)

        return {
            "column_used": col_name,
            "nps_score": nps_score,
            "promoters": promoters,
            "passives": passives,
            "detractors": detractors,
            "total_responses": total,
            "promoter_pct": round(promoters / total * 100, 1),
            "detractor_pct": round(detractors / total * 100, 1),
            "benchmark": self._nps_benchmark(nps_score),
        }

    @staticmethod
    def _nps_benchmark(score: float) -> str:
        if score >= 70:
            return "World-class (70+)"
        if score >= 50:
            return "Excellent (50-69)"
        if score >= 30:
            return "Good (30-49)"
        if score >= 0:
            return "Acceptable (0-29)"
        return "Needs improvement (negative)"

    # ── Rating columns ────────────────────────────────────────────────────────

    def _ratings(self, df: pd.DataFrame, learned: dict = None) -> dict:
        learned = learned or {}
        results = {}
        for col in df.columns:
            if not pd.api.types.is_numeric_dtype(df[col]):
                continue
            is_known_rating = learned.get(col) == "rating"
            if not is_known_rating and not any(kw in col.lower() for kw in self.RATING_KEYWORDS):
                continue

            series = pd.to_numeric(df[col], errors="coerce").dropna()
            if series.empty:
                continue

            mean = round(float(series.mean()), 2)
            scale_max = float(series.max())
            pct_of_max = round(mean / scale_max * 100, 1) if scale_max > 0 else None

            dist = series.value_counts().sort_index()
            top_score = float(dist.idxmax()) if not dist.empty else None

            results[col] = {
                "mean": mean,
                "median": round(float(series.median()), 2),
                "std_dev": round(float(series.std()), 2),
                "min": float(series.min()),
                "max": scale_max,
                "count": int(series.count()),
                "pct_of_max_score": pct_of_max,
                "most_common_score": top_score,
                "distribution": {str(k): int(v) for k, v in dist.items()},
                "performance": self._rating_label(pct_of_max),
            }

        # rank columns by mean (as % of their own scale)
        if results:
            ranked = sorted(results.items(), key=lambda x: x[1].get("pct_of_max_score") or 0, reverse=True)
            top = ranked[0][0] if ranked else None
            bottom = ranked[-1][0] if len(ranked) > 1 else None
            results["__summary__"] = {
                "highest_rated_area": top,
                "lowest_rated_area": bottom,
                "total_rating_columns": len(ranked),
            }

        return results

    @staticmethod
    def _rating_label(pct: float | None) -> str:
        if pct is None:
            return "unknown"
        if pct >= 90:
            return "Outstanding"
        if pct >= 75:
            return "Good"
        if pct >= 60:
            return "Acceptable"
        return "Needs improvement"

    # ── Open-text samples ─────────────────────────────────────────────────────

    def _open_text_samples(self, df: pd.DataFrame, learned: dict = None, n: int = 8) -> dict:
        learned = learned or {}
        results = {}
        for col in df.columns:
            is_known_text = learned.get(col) == "open_text"
            if not is_known_text and not any(kw in col.lower() for kw in self.OPEN_TEXT_KEYWORDS):
                continue
            if pd.api.types.is_numeric_dtype(df[col]):
                continue

            texts = (
                df[col]
                .dropna()
                .astype(str)
                .str.strip()
                .pipe(lambda s: s[s.str.len() > 10])  # skip trivial entries
                .drop_duplicates()
            )
            if texts.empty:
                continue

            results[col] = {
                "response_count": len(texts),
                "samples": texts.head(n).tolist(),
            }

        return results

    # ── Demographics ──────────────────────────────────────────────────────────

    def _demographics(self, df: pd.DataFrame, learned: dict = None) -> dict:
        learned = learned or {}
        results = {}
        for col in df.columns:
            is_known_demo = learned.get(col) == "demographic"
            if not is_known_demo and not any(kw in col.lower() for kw in self.DEMO_KEYWORDS):
                continue
            if pd.api.types.is_numeric_dtype(df[col]):
                continue

            counts = df[col].value_counts()
            total = counts.sum()
            results[col] = {
                "breakdown": {
                    str(k): {"count": int(v), "pct": round(v / total * 100, 1)}
                    for k, v in counts.head(10).items()
                },
                "unique_values": int(df[col].nunique()),
            }

        return results

    # ── Time pattern ──────────────────────────────────────────────────────────

    def _time_pattern(self, df: pd.DataFrame, learned: dict = None) -> dict | None:
        date_col = self._find_col_with_memory(df, self.DATE_KEYWORDS, "datetime", learned or {}, datetime_only=True)
        if date_col is None:
            return None

        col = df[date_col]
        result: dict[str, Any] = {"column_used": date_col}

        daily = col.dt.date.value_counts().sort_index()
        if not daily.empty:
            result["registrations_by_day"] = {str(k): int(v) for k, v in daily.items()}
            result["peak_registration_date"] = str(daily.idxmax())

        hourly = col.dt.hour.value_counts().sort_index()
        if not hourly.empty:
            result["peak_registration_hour"] = f"{int(hourly.idxmax()):02d}:00"

        return result

    # ── Correlations ──────────────────────────────────────────────────────────

    def _correlations(self, df: pd.DataFrame) -> list[dict] | None:
        numeric_cols = df.select_dtypes(include="number").columns.tolist()
        if len(numeric_cols) < 2:
            return None

        corr = df[numeric_cols].corr()
        pairs = []
        seen = set()
        for i, col_a in enumerate(numeric_cols):
            for col_b in numeric_cols[i + 1:]:
                key = tuple(sorted([col_a, col_b]))
                if key in seen:
                    continue
                seen.add(key)
                val = corr.loc[col_a, col_b]
                if abs(val) >= 0.4:  # only report meaningful correlations
                    pairs.append({
                        "columns": [col_a, col_b],
                        "correlation": round(float(val), 3),
                        "strength": self._corr_label(val),
                    })

        pairs.sort(key=lambda x: abs(x["correlation"]), reverse=True)
        return pairs[:5] if pairs else None

    @staticmethod
    def _corr_label(r: float) -> str:
        a = abs(r)
        direction = "positive" if r > 0 else "negative"
        if a >= 0.7:
            return f"strong {direction}"
        if a >= 0.4:
            return f"moderate {direction}"
        return f"weak {direction}"

    # ── Data quality report ───────────────────────────────────────────────────

    def _data_quality(self, df: pd.DataFrame) -> dict:
        total_cells = df.size
        missing_cells = int(df.isna().sum().sum())
        completeness = round((1 - missing_cells / max(total_cells, 1)) * 100, 1)

        cols_with_missing = {
            col: int(df[col].isna().sum())
            for col in df.columns
            if df[col].isna().sum() > 0
        }

        return {
            "total_rows": len(df),
            "total_columns": len(df.columns),
            "completeness_pct": completeness,
            "missing_cells": missing_cells,
            "columns_with_missing": cols_with_missing,
            "duplicate_rows_removed": "handled during cleaning",
        }

    # ── Utility ───────────────────────────────────────────────────────────────

    def _find_col_with_memory(
        self,
        df: pd.DataFrame,
        keywords: list[str],
        role: str,
        learned: dict,
        numeric_only: bool = False,
        datetime_only: bool = False,
    ) -> str | None:
        # 1. Check memory-confirmed columns first (highest confidence)
        for col in df.columns:
            if learned.get(col) == role:
                if numeric_only and not pd.api.types.is_numeric_dtype(df[col]):
                    continue
                if datetime_only and not pd.api.types.is_datetime64_any_dtype(df[col]):
                    continue
                return col
        # 2. Fall back to keyword matching
        return self._find_col(df, keywords, numeric_only, datetime_only)

    def _find_col(
        self,
        df: pd.DataFrame,
        keywords: list[str],
        numeric_only: bool = False,
        datetime_only: bool = False,
    ) -> str | None:
        for col in df.columns:
            if not any(kw in col.lower() for kw in keywords):
                continue
            if numeric_only and not pd.api.types.is_numeric_dtype(df[col]):
                continue
            if datetime_only and not pd.api.types.is_datetime64_any_dtype(df[col]):
                continue
            return col
        return None
