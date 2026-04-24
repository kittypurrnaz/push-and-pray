import json
import re
import pandas as pd
import anthropic


class AnalystAgent:
    """
    Analyst Agent — profiles a raw dataframe before it hits the cleaning pipeline.

    Intended responsibilities:
    - Detect the source platform (Eventbrite, Airtable, Zoom, HubSpot, etc.)
    - Identify data quality issues (missing values, duplicates, type mismatches)
    - Generate column-level semantic hints (e.g. "this column is NPS scores 0-10")
    - Suggest a cleaning strategy tailored to this specific dataset
    - Flag anomalies worth surfacing in the final report

    Current status: PLACEHOLDER
    _basic_profile() runs now with no API call.
    _claude_analyse() is fully written and ready — just uncomment the call in analyse().
    """

    def __init__(self, api_key: str = None):
        self.api_key = api_key
        self.client = anthropic.Anthropic(api_key=api_key) if api_key else None

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def analyse(self, df: pd.DataFrame, filename: str = "") -> dict:
        """
        Profiles a raw dataframe and returns analyst hints for the cleaning pipeline.

        Args:
            df:       Raw dataframe (before any cleaning)
            filename: Original filename — helps with platform detection

        Returns:
            dict with keys: platform, quality_issues, column_hints, notes
        """
        profile = self._basic_profile(df, filename)

        # ── Claude-powered analysis (falls back to basic profile on error) ──
        if self.client:
            try:
                return self._claude_analyse(df, profile)
            except Exception:
                pass

        return profile

    # ------------------------------------------------------------------
    # Basic profiling (no API call)
    # ------------------------------------------------------------------

    def _basic_profile(self, df: pd.DataFrame, filename: str) -> dict:
        quality_issues = []

        missing_pct = (df.isna().sum() / max(len(df), 1) * 100).round(1)
        high_missing = missing_pct[missing_pct > 30].to_dict()
        if high_missing:
            quality_issues.append(
                f"High missing data (>30%) in: {list(high_missing.keys())}"
            )

        duplicate_count = int(df.duplicated().sum())
        if duplicate_count:
            quality_issues.append(f"{duplicate_count} exact duplicate rows detected")

        all_empty_cols = df.columns[df.isna().all()].tolist()
        if all_empty_cols:
            quality_issues.append(f"Fully empty columns: {all_empty_cols}")

        return {
            "platform": self._detect_platform(df.columns.tolist(), filename),
            "row_count": len(df),
            "column_count": len(df.columns),
            "quality_issues": quality_issues if quality_issues else ["No major issues detected"],
            "column_hints": {},
            "notes": "Basic profile — Claude-powered analysis not yet active.",
        }

    def _detect_platform(self, columns: list, filename: str) -> str:
        cols = " ".join(columns).lower()
        fname = filename.lower()

        if "eventbrite" in fname or ("order" in cols and "ticket" in cols):
            return "Eventbrite"
        if "airtable" in fname or "record id" in cols:
            return "Airtable"
        if "hubspot" in fname or "contact owner" in cols:
            return "HubSpot"
        if "powerbi" in fname or "datekey" in cols:
            return "PowerBI"
        if "zoom" in fname or "join time" in cols:
            return "Zoom"
        if "hopin" in fname or "session" in cols and "ticket type" in cols:
            return "Hopin"
        if "surveymonkey" in fname or "respondent id" in cols:
            return "SurveyMonkey"
        if "typeform" in fname or "submission id" in cols:
            return "Typeform"

        return "Unknown platform"

    # ------------------------------------------------------------------
    # Claude-powered analysis (ready to activate)
    # ------------------------------------------------------------------

    def _claude_analyse(self, df: pd.DataFrame, profile: dict) -> dict:
        """
        Full Claude-powered dataset profiling.

        Sends column names + a small sample to Claude (Haiku for speed/cost)
        and gets back a structured JSON profile with semantic column hints,
        platform detection, and tailored cleaning recommendations.
        """
        sample = df.head(5).to_dict(orient="records")
        columns = df.columns.tolist()

        prompt = f"""You are an expert data analyst. Inspect this raw dataset and return a JSON profile.

Columns: {json.dumps(columns)}
Sample rows (first 5): {json.dumps(sample, default=str)}
Basic auto-profile: {json.dumps(profile)}

Return a JSON object with exactly these keys:
{{
  "platform": "detected source platform (Eventbrite, Airtable, Zoom, HubSpot, SurveyMonkey, Typeform, PowerBI, or Unknown)",
  "quality_issues": ["list of specific data quality problems found"],
  "column_hints": {{
    "ColumnName": "what this column represents semantically"
  }},
  "cleaning_recommendations": ["specific cleaning steps tailored to this dataset"],
  "anomalies": ["anything unusual worth flagging in the report"],
  "notes": "brief analyst commentary in 1-2 sentences"
}}

Rules: be specific, reference actual column names, do not invent data."""

        message = self.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = message.content[0].text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```\s*$", "", raw, flags=re.MULTILINE)
        return json.loads(raw)
