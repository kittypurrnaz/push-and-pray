import streamlit as st
import json

from data_cleaner import DataCleaner
from report_generator import ReportGenerator

st.set_page_config(
    page_title="Post Event Report Generator",
    page_icon="📊",
    layout="wide",
)

st.title("📊 Post Event Report Auto Generator")
st.markdown(
    "Upload your messy event data — attendance lists, survey exports, PowerBI CSVs — "
    "and get a clean, client-ready Word report in seconds."
)

# ── Sidebar ──────────────────────────────────────────────────────────────────

with st.sidebar:
    st.header("Event Details")
    event_name = st.text_input("Event Name *", placeholder="e.g. Tech Summit 2025")
    event_date = st.date_input("Event Date")
    client_name = st.text_input("Client Name", placeholder="e.g. Acme Corp")
    organizer_name = st.text_input("Agency / Organizer", placeholder="e.g. EventPro Agency")

    st.divider()
    st.subheader("Report Sections")
    inc_exec = st.checkbox("Executive Summary", value=True)
    inc_attendance = st.checkbox("Attendance & Reach", value=True)
    inc_satisfaction = st.checkbox("Satisfaction & Feedback", value=True)
    inc_highlights = st.checkbox("Key Highlights", value=True)
    inc_recommendations = st.checkbox("Recommendations", value=True)

    st.divider()
    api_key = st.text_input(
        "Anthropic API Key *",
        type="password",
        help="Get yours at console.anthropic.com",
    )

# ── File upload ───────────────────────────────────────────────────────────────

st.header("1. Upload Your Data")
col_a, col_b = st.columns(2)

with col_a:
    attendance_file = st.file_uploader(
        "Attendance / Registration Data",
        type=["xlsx", "xls", "xlsm", "csv"],
        help="Attendee list, registration export, or check-in sheet",
    )

with col_b:
    survey_file = st.file_uploader(
        "Survey / Feedback Data",
        type=["xlsx", "xls", "xlsm", "csv"],
        help="Post-event survey responses or NPS export",
    )

additional_context = st.text_area(
    "Additional Context (optional)",
    placeholder=(
        "e.g. Target audience: C-suite executives. Event goal: product launch. "
        "Budget: $50k. Keynote speaker: John Doe. Any notes for the report writer..."
    ),
    height=90,
)

# ── Validation & generate ─────────────────────────────────────────────────────

ready = bool(event_name and api_key and (attendance_file or survey_file))

if not ready:
    st.info(
        "Fill in **Event Name** and **API Key** in the sidebar, "
        "then upload at least one data file to unlock the generator."
    )

if st.button("Generate Report", type="primary", disabled=not ready):

    cleaner = DataCleaner()
    attendance_summary = None
    survey_summary = None

    # ── Step 1: clean & preview ──────────────────────────────────────────────
    st.header("2. Data Preview")

    with st.spinner("Cleaning data..."):

        if attendance_file:
            try:
                df_att = cleaner.load_file(attendance_file)
                df_att = cleaner.clean(df_att)
                attendance_summary = cleaner.summarize(df_att, "attendance")

                st.subheader("Attendance Data")
                st.dataframe(df_att.head(20), use_container_width=True)

                with st.expander("Attendance — full summary stats (JSON)"):
                    st.json(attendance_summary)

            except Exception as e:
                st.error(f"Could not process attendance file: {e}")

        if survey_file:
            try:
                df_sur = cleaner.load_file(survey_file)
                df_sur = cleaner.clean(df_sur)
                survey_summary = cleaner.summarize(df_sur, "survey")

                st.subheader("Survey / Feedback Data")
                st.dataframe(df_sur.head(20), use_container_width=True)

                with st.expander("Survey — full summary stats (JSON)"):
                    st.json(survey_summary)

            except Exception as e:
                st.error(f"Could not process survey file: {e}")

    # ── Step 2: generate report ──────────────────────────────────────────────
    st.header("3. AI Report Generation")

    with st.spinner("Generating insights with Claude..."):

        config = {
            "event_name": event_name,
            "event_date": str(event_date),
            "client_name": client_name,
            "organizer_name": organizer_name,
            "additional_context": additional_context,
            "sections": {
                "exec_summary": inc_exec,
                "attendance": inc_attendance,
                "satisfaction": inc_satisfaction,
                "highlights": inc_highlights,
                "recommendations": inc_recommendations,
            },
        }

        try:
            generator = ReportGenerator(api_key=api_key)
            report_bytes = generator.generate(
                config=config,
                attendance_summary=attendance_summary,
                survey_summary=survey_summary,
            )

            st.success("Report generated successfully!")

            filename = f"{event_name.replace(' ', '_')}_Post_Event_Report.pptx"
            st.download_button(
                label="⬇ Download Report (.pptx)",
                data=report_bytes,
                file_name=filename,
                mime="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            )

        except Exception as e:
            st.error(f"Report generation failed: {e}")
            st.exception(e)