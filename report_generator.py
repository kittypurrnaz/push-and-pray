import anthropic
import json
import io
import re
from datetime import date

from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH


BLUE = RGBColor(0x1A, 0x56, 0xDB)
DARK = RGBColor(0x37, 0x4A, 0x6B)
GREY = RGBColor(0x6B, 0x72, 0x80)
LIGHT_GREY = RGBColor(0x9C, 0xA3, 0xAF)

SYSTEM_PROMPT = (
    "You are an expert post-event report writer for a professional events agency. "
    "You write clear, data-driven, client-facing reports. Always respond with valid JSON only — "
    "no markdown fences, no commentary outside the JSON object."
)


class ReportGenerator:

    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)

    # ------------------------------------------------------------------
    # Prompt assembly
    # ------------------------------------------------------------------

    def _build_user_prompt(
        self,
        config: dict,
        attendance_summary: dict | None,
        survey_summary: dict | None,
    ) -> str:
        sections = config.get("sections", {})

        lines = [
            "Generate a post-event report based on the details and data below.\n",
            "EVENT DETAILS:",
            f"  Event Name : {config['event_name']}",
            f"  Event Date : {config['event_date']}",
            f"  Client     : {config.get('client_name') or 'Not specified'}",
            f"  Organizer  : {config.get('organizer_name') or 'Not specified'}",
            f"  Context    : {config.get('additional_context') or 'None provided'}",
            "",
        ]

        if attendance_summary:
            lines.append("ATTENDANCE DATA (cleaned summary):")
            lines.append(json.dumps(attendance_summary, indent=2, default=str))
            lines.append("")

        if survey_summary:
            lines.append("SURVEY / FEEDBACK DATA (cleaned summary):")
            lines.append(json.dumps(survey_summary, indent=2, default=str))
            lines.append("")

        lines.append("Return a JSON object with these keys (include only the keys listed):")
        lines.append("{")

        if sections.get("exec_summary"):
            lines.append(
                '  "executive_summary": "3-4 sentence paragraph summarising the event success, '
                'key metrics, and overall outcome for the client",'
            )
        if sections.get("attendance"):
            lines.append(
                '  "attendance_analysis": "Paragraph on registration vs attendance numbers, '
                'show-up rate, and any audience composition insights. Quote specific figures.",'
            )
        if sections.get("satisfaction"):
            lines.append(
                '  "satisfaction_analysis": "Paragraph covering satisfaction scores, NPS if present, '
                'top positive themes, and one or two areas to watch. Quote specific scores.",'
            )
        if sections.get("highlights"):
            lines.append('  "key_highlights": ["5 concise bullet strings, each a standalone insight"],')
        if sections.get("recommendations"):
            lines.append('  "recommendations": ["4 actionable bullet strings for the next event"],')

        lines.append(
            '  "closing_statement": "One professional closing paragraph thanking the client '
            'and expressing confidence in future events"'
        )
        lines.append("}")
        lines.append("")
        lines.append(
            "Rules: use only numbers present in the data — do not invent figures. "
            "If data for a section is absent, write a graceful note. "
            "Keep each paragraph 3-5 sentences. Professional, positive, client-facing tone."
        )

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Claude call (with prompt caching on the stable system prompt)
    # ------------------------------------------------------------------

    def _call_claude(self, user_prompt: str) -> dict:
        message = self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_prompt}],
        )

        raw = message.content[0].text.strip()
        # strip accidental markdown fences
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```\s*$", "", raw, flags=re.MULTILINE)
        return json.loads(raw)

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def generate(
        self,
        config: dict,
        attendance_summary: dict | None = None,
        survey_summary: dict | None = None,
    ) -> bytes:
        prompt = self._build_user_prompt(config, attendance_summary, survey_summary)
        insights = self._call_claude(prompt)
        return self._build_docx(config, insights, attendance_summary, survey_summary)

    # ------------------------------------------------------------------
    # docx helpers
    # ------------------------------------------------------------------

    def _heading(self, doc: Document, text: str, level: int = 1):
        h = doc.add_heading(text, level=level)
        h.alignment = WD_ALIGN_PARAGRAPH.LEFT
        if h.runs:
            h.runs[0].font.color.rgb = BLUE if level == 1 else DARK

    def _metric_table(self, doc: Document, metrics: list[tuple[str, str]]):
        table = doc.add_table(rows=1, cols=len(metrics))
        table.style = "Table Grid"
        for i, (label, value) in enumerate(metrics):
            cell = table.rows[0].cells[i]
            cell.paragraphs[0].clear()
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER

            r_val = p.add_run(str(value))
            r_val.bold = True
            r_val.font.size = Pt(22)
            r_val.font.color.rgb = BLUE

            p.add_run("\n")

            r_lbl = p.add_run(label)
            r_lbl.font.size = Pt(8)
            r_lbl.font.color.rgb = GREY

        doc.add_paragraph()

    def _bullets(self, doc: Document, items: list[str]):
        for item in items:
            p = doc.add_paragraph(style="List Bullet")
            p.add_run(str(item))

    # ------------------------------------------------------------------
    # docx assembly
    # ------------------------------------------------------------------

    def _build_docx(
        self,
        config: dict,
        insights: dict,
        attendance_summary: dict | None,
        survey_summary: dict | None,
    ) -> bytes:
        doc = Document()

        # margins
        for sec in doc.sections:
            sec.top_margin = Inches(1)
            sec.bottom_margin = Inches(1)
            sec.left_margin = Inches(1.2)
            sec.right_margin = Inches(1.2)

        # --- Title block ---
        title_p = doc.add_paragraph()
        title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = title_p.add_run(config["event_name"].upper())
        r.bold = True
        r.font.size = Pt(26)
        r.font.color.rgb = BLUE

        sub_p = doc.add_paragraph()
        sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        sr = sub_p.add_run("POST EVENT REPORT")
        sr.font.size = Pt(13)
        sr.font.color.rgb = GREY

        meta_parts = [str(config["event_date"])]
        if config.get("client_name"):
            meta_parts.append(f"Prepared for: {config['client_name']}")
        if config.get("organizer_name"):
            meta_parts.append(f"By: {config['organizer_name']}")

        meta_p = doc.add_paragraph()
        meta_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        mr = meta_p.add_run("  |  ".join(meta_parts))
        mr.font.size = Pt(10)
        mr.font.color.rgb = LIGHT_GREY

        doc.add_paragraph()

        # --- At-a-glance metrics strip ---
        metrics: list[tuple[str, str]] = []
        if attendance_summary:
            reg = attendance_summary.get("registered", attendance_summary.get("total_rows"))
            if reg is not None:
                metrics.append(("Total Registered", f"{reg:,}"))
            if "checked_in" in attendance_summary:
                metrics.append(("Attended", f"{attendance_summary['checked_in']:,}"))
            if "attendance_rate_pct" in attendance_summary:
                metrics.append(("Show-up Rate", f"{attendance_summary['attendance_rate_pct']}%"))

        if survey_summary and survey_summary.get("rating_columns"):
            col_name, col_stats = next(iter(survey_summary["rating_columns"].items()))
            scale = "/10" if col_stats.get("max", 0) > 5 else "/5"
            metrics.append(("Avg Satisfaction", f"{col_stats['mean']}{scale}"))

        if metrics:
            self._heading(doc, "At a Glance", 2)
            self._metric_table(doc, metrics)

        # --- Content sections ---
        section_map = [
            ("executive_summary", "Executive Summary", "paragraph"),
            ("attendance_analysis", "Attendance & Reach", "paragraph"),
            ("satisfaction_analysis", "Attendee Satisfaction & Feedback", "paragraph"),
            ("key_highlights", "Key Highlights", "bullets"),
            ("recommendations", "Recommendations for Future Events", "bullets"),
            ("closing_statement", "Closing", "paragraph"),
        ]

        for key, heading_text, kind in section_map:
            if key not in insights:
                continue
            level = 2 if key == "closing_statement" else 1
            self._heading(doc, heading_text, level)
            if kind == "paragraph":
                doc.add_paragraph(str(insights[key]))
            else:
                self._bullets(doc, insights[key])
            doc.add_paragraph()

        # --- Footer ---
        footer_p = doc.add_paragraph()
        footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        fr = footer_p.add_run(
            f"Confidential  •  {config.get('organizer_name', '')}  •  "
            f"{date.today().strftime('%B %Y')}"
        )
        fr.font.size = Pt(9)
        fr.font.color.rgb = LIGHT_GREY

        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        return buf.read()
