export interface CommentaryInput {
  eventName: string;
  client: string;
  toneOfVoice: string;
  metrics: Record<string, unknown>;
  insights: string[];
  topComments: Array<{ text: string; sentiment?: string }>;
}

export interface CommentaryOutput {
  headline: string;
  subheadline: string;
  exec_summary: string[];
  conversion_commentary: string;
  venue_commentary: string;
  demographics_commentary: string;
  voice_of_attendee: string;
  recommendations: string[];
}

export async function generateCommentary(
  input: CommentaryInput,
): Promise<CommentaryOutput> {
  const res = await fetch("/api/commentary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const status = res.status;
    if (status === 429) throw new Error("Rate limit hit — wait a moment and try again.");
    if (status === 402) throw new Error("AI credits exhausted.");
    throw new Error(`Commentary request failed (${status})`);
  }
  return res.json();
}
