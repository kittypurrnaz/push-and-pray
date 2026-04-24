import json
import os

import anthropic
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})


@app.route("/api/commentary", methods=["POST"])
def commentary():
    api_key = request.headers.get("X-Api-Key") or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return jsonify({"error": "Missing API key — pass X-Api-Key header"}), 401

    data = request.get_json(force=True)
    event_name = data.get("eventName", "")
    client_name = data.get("client", "")
    tone = data.get("toneOfVoice", "professional")
    metrics = data.get("metrics", {})
    insights = data.get("insights", [])
    top_comments = data.get("topComments", [])

    user_prompt = f"""You are writing a post-event report for the following event:

Event name: {event_name}
Client: {client_name}
Tone of voice: {tone}

Key metrics:
{json.dumps(metrics, indent=2)}

Insights:
{chr(10).join(f"- {i}" for i in insights)}

Top attendee comments:
{chr(10).join(f'- {c.get("text", "")} ({c.get("sentiment", "neutral")})' for c in top_comments)}

Return a JSON object with exactly these keys:
- headline: string (punchy one-line headline for the report)
- subheadline: string (supporting one-liner)
- exec_summary: array of strings (3-5 bullet-point sentences for an executive summary)
- conversion_commentary: string (paragraph about conversion/engagement metrics)
- venue_commentary: string (paragraph about venue and logistics)
- demographics_commentary: string (paragraph about attendee demographics)
- voice_of_attendee: string (paragraph synthesising the attendee feedback)
- recommendations: array of strings (3-5 actionable recommendations for next time)

Write in a {tone} tone. Be specific, using the numbers provided. Return only valid JSON — no markdown fences, no extra keys."""

    client = anthropic.Anthropic(api_key=api_key)

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system="You are an expert post-event report writer. Return only valid JSON matching the requested schema.",
        messages=[{"role": "user", "content": user_prompt}],
    )

    text = next(
        (block.text for block in message.content if block.type == "text"), ""
    )

    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        # Strip markdown code fences if the model added them anyway
        stripped = text.strip()
        if stripped.startswith("```"):
            stripped = stripped.split("\n", 1)[-1]
            stripped = stripped.rsplit("```", 1)[0]
        result = json.loads(stripped)

    return jsonify(result)


if __name__ == "__main__":
    app.run(port=5001, debug=True)
