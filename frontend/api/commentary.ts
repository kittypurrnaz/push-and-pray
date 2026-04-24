// Vercel serverless route — proxies the frontend to Anthropic Claude.
// Deploy as-is on Vercel; set ANTHROPIC_API_KEY in project env vars.

export const config = { runtime: "edge" };

const SYSTEM = `You are a senior research analyst writing post-event report commentary.
Reply with STRICT JSON matching this TypeScript type:
{
  headline: string;
  subheadline: string;
  exec_summary: string[];      // 3-5 bullets
  conversion_commentary: string;
  venue_commentary: string;
  demographics_commentary: string;
  voice_of_attendee: string;
  recommendations: string[];   // 3-5 bullets
}
Reference real numbers from the metrics. Plain English. UK spelling. No buzzwords.`;

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response("ANTHROPIC_API_KEY not configured", { status: 500 });

  const body = await req.json();
  const userPrompt = `Event: ${body.eventName}
Client: ${body.client}
Tone of voice: ${body.toneOfVoice || "Confident senior strategist."}

Metrics: ${JSON.stringify(body.metrics, null, 2)}
Insights: ${JSON.stringify(body.insights, null, 2)}
Top comments: ${JSON.stringify(body.topComments?.slice(0, 10), null, 2)}

Return JSON only — no prose, no markdown fences.`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!r.ok) {
    return new Response(await r.text(), { status: r.status });
  }
  const data = await r.json();
  const text: string = data.content?.[0]?.text ?? "{}";
  // Strip accidental code fences
  const json = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return new Response(json, { headers: { "content-type": "application/json" } });
}
