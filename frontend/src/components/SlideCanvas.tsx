import { THEMES, type ThemeId } from "@/lib/themes";
import type { ComputedMetrics } from "@/lib/metrics";
import type { DeckSlide } from "@/lib/pptxExport";
import { cn } from "@/lib/utils";

interface SlideCanvasProps {
  themeId: ThemeId;
  slide: DeckSlide;
  metrics: ComputedMetrics;
  client: string;
  eventName: string;
  className?: string;
}

const fmt = (n: number | null | undefined, opts: Intl.NumberFormatOptions = {}) =>
  n === null || n === undefined ? "—" : n.toLocaleString(undefined, opts);

export const SlideCanvas = ({ themeId, slide, metrics, client, eventName, className }: SlideCanvasProps) => {
  const t = THEMES[themeId];
  const style: React.CSSProperties = {
    background: `#${t.bg}`,
    color: `#${t.fg}`,
    fontFamily: t.font,
  };
  const accent = `#${t.accent}`;
  const muted = `#${t.muted}`;
  const card = `#${t.card}`;

  return (
    <div
      className={cn("relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border/60 shadow-elevated", className)}
      style={style}
    >
      <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: accent }} />

      {slide.kind === "title" ? (
        <div className="flex h-full flex-col justify-between p-[4%]">
          <div className="text-[1%] tracking-[0.4em] uppercase" style={{ color: muted, fontSize: "max(10px,1%)" }}>
            {client}
          </div>
          <div>
            <h1 className="text-[6%] font-semibold leading-[1.05]" style={{ fontFamily: t.displayFont, fontSize: "6%", color: `#${t.fg}` }}>
              <span style={{ fontSize: "min(4.5vw,64px)" }}>{slide.title || eventName}</span>
            </h1>
            {slide.subtitle && (
              <p className="mt-3" style={{ color: muted, fontSize: "min(1.6vw,18px)" }}>{slide.subtitle}</p>
            )}
          </div>
          <div className="flex items-center justify-between" style={{ color: muted, fontSize: "min(1vw,11px)" }}>
            <span className="tracking-[0.3em] uppercase">Post-Event Report</span>
            <span className="tracking-[0.3em] uppercase">{new Date().toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col p-[4%]">
          <div className="flex items-center gap-2 uppercase tracking-[0.3em]" style={{ color: accent, fontSize: "min(0.95vw,11px)" }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
            {slide.title}
          </div>
          {slide.subtitle && (
            <h2 className="mt-2 font-semibold leading-tight" style={{ fontFamily: t.displayFont, fontSize: "min(3.5vw,40px)" }}>
              {slide.subtitle}
            </h2>
          )}

          <div className="mt-6 flex-1">
            {slide.kind === "metrics" && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Attendees", value: fmt(metrics.totals.totalAttendees) },
                  { label: "Registrations", value: fmt(metrics.totals.totalRegistrations) },
                  { label: "Show-up rate", value: metrics.totals.conversionRate !== null ? `${(metrics.totals.conversionRate * 100).toFixed(1)}%` : "—" },
                  { label: "Survey responses", value: fmt(metrics.totals.totalSurveyResponses) },
                  { label: "NPS", value: metrics.totals.nps !== null ? String(metrics.totals.nps) : "—" },
                  { label: "Avg dwell (min)", value: metrics.totals.avgDwellMinutes !== null ? metrics.totals.avgDwellMinutes.toFixed(1) : "—" },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg p-3" style={{ background: card }}>
                    <p className="uppercase tracking-[0.2em]" style={{ color: muted, fontSize: "min(0.85vw,10px)" }}>{s.label}</p>
                    <p className="mt-1 font-semibold" style={{ fontFamily: t.displayFont, fontSize: "min(3.2vw,38px)" }}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            {slide.kind === "venues" && (
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  {metrics.venues.slice(0, 6).map((v) => (
                    <div key={v.venue}>
                      <div className="flex items-baseline justify-between" style={{ fontSize: "min(1.1vw,13px)" }}>
                        <span className="truncate pr-2">{v.venue}</span>
                        <span style={{ color: muted }}>{(v.share * 100).toFixed(0)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full" style={{ background: card }}>
                        <div className="h-full rounded-full" style={{ width: `${v.share * 100}%`, background: accent }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="whitespace-pre-wrap" style={{ fontSize: "min(1.1vw,13px)", color: `#${t.fg}` }}>
                  {slide.body}
                </p>
              </div>
            )}

            {slide.kind === "demographics" && (
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  {metrics.ageBuckets.map((b) => (
                    <div key={b.bucket}>
                      <div className="flex items-baseline justify-between" style={{ fontSize: "min(1.1vw,13px)" }}>
                        <span>{b.bucket}</span>
                        <span style={{ color: muted }}>{(b.share * 100).toFixed(0)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full" style={{ background: card }}>
                        <div className="h-full rounded-full" style={{ width: `${b.share * 100}%`, background: accent }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="whitespace-pre-wrap" style={{ fontSize: "min(1.1vw,13px)" }}>{slide.body}</p>
              </div>
            )}

            {(slide.kind === "insights" || slide.kind === "commentary") && (
              <ul className="space-y-3">
                {(slide.body ?? "").split(/\n+/).filter(Boolean).map((line, i) => (
                  <li key={i} className="flex gap-3" style={{ fontSize: "min(1.3vw,15px)" }}>
                    <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                    <span>{line.replace(/^[-•]\s*/, "")}</span>
                  </li>
                ))}
              </ul>
            )}

            {slide.kind === "voices" && (
              <div className="space-y-4">
                {metrics.topComments.slice(0, 3).map((q, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-1 shrink-0 rounded-full" style={{ background: accent }} />
                    <p className="italic" style={{ fontFamily: t.displayFont, fontSize: "min(1.5vw,18px)" }}>"{q}"</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
