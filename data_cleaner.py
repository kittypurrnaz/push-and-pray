import pandas as pd
import numpy as np
import io


RATING_KEYWORDS = ["rating", "score", "satisfaction", "nps", "rate", "scale", "stars", "out of"]
DATE_KEYWORDS = ["date", "time", "timestamp", "registered", "checked", "joined", "created"]
CHECKIN_KEYWORDS = ["check", "attend", "present", "joined", "scanned", "arrived"]


class DataCleaner:

    def load_file(self, uploaded_file) -> pd.DataFrame:
        name = uploaded_file.name.lower()
        if name.endswith(".csv"):
            for enc in ["utf-8", "latin-1", "cp1252"]:
                try:
                    uploaded_file.seek(0)
                    return pd.read_csv(uploaded_file, encoding=enc)
                except UnicodeDecodeError:
                    continue
            uploaded_file.seek(0)
            return pd.read_csv(uploaded_file, encoding="utf-8", errors="replace")
        elif name.endswith((".xlsx", ".xlsm")):
            return pd.read_excel(uploaded_file, engine="openpyxl")
        else:
            return pd.read_excel(uploaded_file, engine="xlrd")

    def clean(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()

        # normalise column names
        df.columns = [str(c).strip() for c in df.columns]

        # drop fully empty rows / columns
        df.dropna(how="all", inplace=True)
        df.dropna(axis=1, how="all", inplace=True)

        # remove exact duplicate rows
        df.drop_duplicates(inplace=True)

        # strip strings, replace empty / literal "nan" with NaN
        for col in df.select_dtypes(include="object").columns:
            df[col] = df[col].astype(str).str.strip()
            df[col] = df[col].replace({"nan": np.nan, "None": np.nan, "N/A": np.nan, "": np.nan})

        # promote string columns that are >70 % numeric
        for col in df.select_dtypes(include="object").columns:
            converted = pd.to_numeric(df[col], errors="coerce")
            if converted.notna().sum() / max(len(df), 1) > 0.70:
                df[col] = converted

        # parse obvious date columns
        for col in df.columns:
            if any(kw in col.lower() for kw in DATE_KEYWORDS):
                try:
                    df[col] = pd.to_datetime(df[col], errors="coerce")
                except Exception:
                    pass

        df.reset_index(drop=True, inplace=True)
        return df

    def summarize(self, df: pd.DataFrame, data_type: str) -> dict:
        summary: dict = {
            "data_type": data_type,
            "total_rows": len(df),
            "total_columns": len(df.columns),
            "columns": list(df.columns),
            "numeric_summaries": {},
            "rating_columns": {},
            "categorical_summaries": {},
        }

        for col in df.columns:
            col_lower = col.lower()
            series = df[col].dropna()

            if pd.api.types.is_numeric_dtype(df[col]):
                is_rating = any(kw in col_lower for kw in RATING_KEYWORDS)
                col_stats = {
                    "mean": round(float(series.mean()), 2) if len(series) else None,
                    "median": round(float(series.median()), 2) if len(series) else None,
                    "min": round(float(series.min()), 2) if len(series) else None,
                    "max": round(float(series.max()), 2) if len(series) else None,
                    "count": int(series.count()),
                    "missing": int(df[col].isna().sum()),
                }
                if is_rating:
                    dist = series.value_counts().sort_index()
                    col_stats["distribution"] = {str(k): int(v) for k, v in dist.items()}
                    summary["rating_columns"][col] = col_stats
                else:
                    summary["numeric_summaries"][col] = col_stats

            elif pd.api.types.is_object_dtype(df[col]):
                top = df[col].value_counts().head(10)
                summary["categorical_summaries"][col] = {
                    "unique_values": int(df[col].nunique()),
                    "missing": int(df[col].isna().sum()),
                    "top_values": {str(k): int(v) for k, v in top.items()},
                }

        # attendance-specific enrichment
        if data_type == "attendance":
            summary["registered"] = len(df)
            checkin_cols = [c for c in df.columns if any(kw in c.lower() for kw in CHECKIN_KEYWORDS)]
            if checkin_cols:
                col = checkin_cols[0]
                if pd.api.types.is_datetime64_any_dtype(df[col]):
                    checked_in = int(df[col].notna().sum())
                else:
                    checked_in = int(
                        df[col].astype(str).str.lower().isin(["yes", "true", "1", "attended", "present"]).sum()
                    )
                summary["checked_in"] = checked_in
                summary["no_show"] = len(df) - checked_in
                summary["attendance_rate_pct"] = round(checked_in / max(len(df), 1) * 100, 1)

        return summary
