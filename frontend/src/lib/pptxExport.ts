import pptxgen from "pptxgenjs";
import type { ComputedMetrics } from "./metrics";
import { THEMES, type ThemeId } from "./themes";

export interface DeckSlide {
  id: string;
  kind: "title" | "metrics" | "venues" | "demographics" | "insights" | "commentary" | "voices";
  title: string;
  subtitle?: string;
  body?: string;
}

export interface DeckPayload {
  eventName: string;
  client: string;
  themeId: ThemeId;
  slides: DeckSlide[];
  metrics: ComputedMetrics;
}

export async function exportDeck(payload: DeckPayload) {
  const theme = THEMES[payload.themeId];
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pptx.title = `${payload.eventName} — Post-Event Report`;

  const W = 13.33, H = 7.5;
  const bg = `#${theme.bg}`;
  const fg = `#${theme.fg}`;
  const accent = `#${theme.accent}`;
  const muted = `#${theme.muted}`;
  const card = `#${theme.card}`;

  const addBg = (s: pptxgen.Slide) => {
    s.background = { color: bg };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.08, w: W, h: 0.08, fill: { color: accent }, line: { color: accent } });
  };

  const fmt = (n: number | null, opts: Intl.NumberFormatOptions = {}) =>
    n === null || n === undefined ? "—" : n.toLocaleString(undefined, opts);

  for (const slide of payload.slides) {
    const s = pptx.addSlide();
    addBg(s);

    if (slide.kind === "title") {
      s.addText(payload.client.toUpperCase(), { x: 0.6, y: 0.55, w: 8, h: 0.4, fontSize: 11, color: muted, fontFace: theme.font, charSpacing: 8 });
      s.addText(slide.title, { x: 0.6, y: 1.6, w: 11, h: 2.4, fontSize: 60, bold: true, color: fg, fontFace: theme.displayFont });
      if (slide.subtitle) s.addText(slide.subtitle, { x: 0.6, y: 4.2, w: 11, h: 0.8, fontSize: 18, color: muted, fontFace: theme.font });
      s.addText("POST-EVENT REPORT", { x: 0.6, y: H - 0.7, w: 6, h: 0.3, fontSize: 9, color: muted, fontFace: theme.font, charSpacing: 12 });
      continue;
    }

    s.addText(slide.title, { x: 0.6, y: 0.45, w: 11, h: 0.6, fontSize: 12, color: accent, fontFace: theme.font, charSpacing: 8, bold: true });
    if (slide.subtitle) s.addText(slide.subtitle, { x: 0.6, y: 0.85, w: 12, h: 0.9, fontSize: 32, bold: true, color: fg, fontFace: theme.displayFont });

    if (slide.kind === "metrics") {
      const t = payload.metrics.totals;
      const stats: { label: string; value: string }[] = [
        { label: "Attendees", value: fmt(t.totalAttendees) },
        { label: "Registrations", value: fmt(t.totalRegistrations) },
        { label: "Show-up rate", value: t.conversionRate !== null ? `${(t.conversionRate * 100).toFixed(1)}%` : "—" },
        { label: "Survey responses", value: fmt(t.totalSurveyResponses) },
        { label: "NPS", value: t.nps !== null ? String(t.nps) : "—" },
        { label: "Avg dwell (min)", value: t.avgDwellMinutes !== null ? t.avgDwellMinutes.toFixed(1) : "—" },
      ];
      const cw = 3.95, ch = 2.2, gap = 0.25;
      stats.forEach((st, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const x = 0.6 + col * (cw + gap);
        const y = 2.1 + row * (ch + gap);
        s.addShape(pptx.ShapeType.roundRect, { x, y, w: cw, h: ch, fill: { color: card }, line: { color: card }, rectRadius: 0.12 });
        s.addText(st.label.toUpperCase(), { x: x + 0.25, y: y + 0.2, w: cw - 0.5, h: 0.3, fontSize: 9, color: muted, fontFace: theme.font, charSpacing: 8 });
        s.addText(st.value, { x: x + 0.25, y: y + 0.55, w: cw - 0.5, h: 1.4, fontSize: 44, bold: true, color: fg, fontFace: theme.displayFont });
      });
      if (slide.body) s.addText(slide.body, { x: 0.6, y: H - 1.2, w: 12, h: 0.8, fontSize: 12, color: muted, fontFace: theme.font, italic: true });
    }

    if (slide.kind === "venues") {
      const data = payload.metrics.venues;
      if (data.length) {
        s.addChart(pptx.ChartType.bar, [{ name: "Visitors", labels: data.map((d) => d.venue), values: data.map((d) => d.visitors) }], {
          x: 0.6, y: 2.0, w: 7.5, h: 4.6,
          barDir: "bar", showLegend: false, chartColors: [accent.replace("#", "")],
          catAxisLabelColor: fg.replace("#", ""), valAxisLabelColor: muted.replace("#", ""),
          plotArea: { fill: { color: bg.replace("#", "") } },
        });
      }
      const txt = slide.body || data.slice(0, 3).map((v) => `• ${v.venue} — ${(v.share * 100).toFixed(0)}%`).join("\n");
      s.addText(txt, { x: 8.4, y: 2.0, w: 4.4, h: 4.6, fontSize: 14, color: fg, fontFace: theme.font, valign: "top" });
    }

    if (slide.kind === "demographics") {
      const data = payload.metrics.ageBuckets;
      if (data.length) {
        s.addChart(pptx.ChartType.doughnut, [{ name: "Age", labels: data.map((d) => d.bucket), values: data.map((d) => d.count) }], {
          x: 0.6, y: 2.0, w: 6, h: 4.6,
          showLegend: true, legendPos: "r", legendColor: fg.replace("#", ""),
          chartColors: [accent, muted, fg, card, accent, muted].map((c) => c.replace("#", "")),
        });
      }
      const demoTxt = slide.body || data.slice(0, 4).map((a) => `• ${a.bucket} — ${(a.share * 100).toFixed(0)}%`).join("\n");
      s.addText(demoTxt, { x: 7, y: 2.0, w: 5.7, h: 4.6, fontSize: 14, color: fg, fontFace: theme.font, valign: "top" });
    }

    if (slide.kind === "insights" || slide.kind === "commentary") {
      const lines = (slide.body ?? "").split(/\n+/).filter(Boolean);
      s.addText(
        lines.map((l) => ({ text: l.replace(/^[-•]\s*/, ""), options: { bullet: { code: "25A0" }, color: fg, fontSize: 16, paraSpaceAfter: 8 } })),
        { x: 0.6, y: 2.0, w: 12, h: 4.8, fontFace: theme.font, valign: "top" },
      );
    }

    if (slide.kind === "voices") {
      const quotes = payload.metrics.topComments.slice(0, 3);
      if (quotes.length) {
        quotes.forEach((q, i) => {
          const y = 2.0 + i * 1.6;
          s.addShape(pptx.ShapeType.rect, { x: 0.6, y, w: 0.06, h: 1.3, fill: { color: accent }, line: { color: accent } });
          s.addText(`"${q}"`, { x: 0.95, y, w: 11.6, h: 1.3, fontSize: 18, italic: true, color: fg, fontFace: theme.displayFont, valign: "top" });
        });
      } else if (slide.subtitle && slide.subtitle !== "Selected verbatim feedback") {
        // Fall back to Claude's synthesised voice_of_attendee paragraph
        s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 2.0, w: 0.06, h: 2.6, fill: { color: accent }, line: { color: accent } });
        s.addText(slide.subtitle, { x: 0.95, y: 2.0, w: 11.6, h: 2.6, fontSize: 18, italic: true, color: fg, fontFace: theme.displayFont, valign: "top" });
      }
    }
  }

  await pptx.writeFile({ fileName: `${payload.eventName.replace(/[^\w]+/g, "_")}_PostEventReport.pptx` });
}
