import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Download, Loader2, Sparkles, Wand2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DropZone, type UploadedFile } from "@/components/DropZone";
import { DatasetSummary } from "@/components/DatasetSummary";
import { ThemePicker } from "@/components/ThemePicker";
import { SlideCanvas } from "@/components/SlideCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseFile, type ParsedDataset } from "@/lib/parsers";
import { computeMetrics, buildInsights, type ComputedMetrics } from "@/lib/metrics";
import type { ThemeId } from "@/lib/themes";
import { exportDeck, type DeckSlide } from "@/lib/pptxExport";
import { generateCommentary } from "@/lib/ai";

type Step = 1 | 2 | 3 | 4;

const PRODUCT = "Market Researcher";

const Index = () => {
  const [step, setStep] = useState<Step>(1);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [datasets, setDatasets] = useState<ParsedDataset[]>([]);
  const [parsing, setParsing] = useState(false);

  const [eventName, setEventName] = useState("");
  const [client, setClient] = useState("");
  const [tone, setTone] = useState("");
  const [themeId, setThemeId] = useState<ThemeId>("midnight");

  const [metrics, setMetrics] = useState<ComputedMetrics | null>(null);
  const [slides, setSlides] = useState<DeckSlide[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const insights = useMemo(() => (metrics ? buildInsights(metrics) : []), [metrics]);

  const onParse = async () => {
    if (!files.length) return toast.error("Add at least one file first.");
    setParsing(true);
    try {
      const all: ParsedDataset[] = [];
      for (const f of files) {
        try {
          const parsed = await parseFile(f.file);
          all.push(...parsed);
        } catch (err) {
          console.error(err);
          toast.error(`Couldn't parse ${f.file.name}`);
        }
      }
      setDatasets(all);
      const m = computeMetrics(all);
      setMetrics(m);
      setStep(2);
    } finally {
      setParsing(false);
    }
  };

  const buildSlides = (commentary?: any): DeckSlide[] => {
    if (!metrics) return [];
    const headline = commentary?.headline ?? `${eventName || "Event"} — Post-Event Report`;
    const sub = commentary?.subheadline ?? `A condensed read-out of attendance, audience and engagement.`;
    const exec = (commentary?.exec_summary as string[] | undefined)?.length
      ? commentary.exec_summary.join("\n")
      : insights.slice(0, 4).join("\n");
    return [
      { id: "title", kind: "title", title: headline, subtitle: sub },
      { id: "metrics", kind: "metrics", title: "By the numbers", subtitle: "Cleaned summary metrics", body: commentary?.conversion_commentary ?? "" },
      { id: "venues", kind: "venues", title: "Venue performance", subtitle: "Where the audience showed up", body: commentary?.venue_commentary ?? insights.find((i) => /venue|footfall/i.test(i)) ?? "" },
      { id: "demographics", kind: "demographics", title: "Audience profile", subtitle: "Who walked through the door", body: commentary?.demographics_commentary ?? insights.find((i) => /skew|age/i.test(i)) ?? "" },
      { id: "insights", kind: "insights", title: "Key insights", subtitle: "What the data is telling us", body: exec },
      { id: "voices", kind: "voices", title: "Voice of attendee", subtitle: commentary?.voice_of_attendee ?? "Selected verbatim feedback" },
      { id: "commentary", kind: "commentary", title: "Recommendations", subtitle: "Where to invest next", body: (commentary?.recommendations as string[] | undefined)?.join("\n") ?? "" },
    ];
  };

  const onGenerate = async () => {
    if (!metrics) return;
    if (!eventName.trim()) return toast.error("Give the event a name.");
    setGenerating(true);
    try {
      try {
        const data = await generateCommentary({
          eventName,
          client: client || "Client",
          toneOfVoice: tone,
          metrics: metrics.totals,
          insights,
          topComments: metrics.topComments.map((text) => ({ text })),
        });
        setSlides(buildSlides(data));
        toast.success("Draft commentary ready. Edit anything before exporting.");
      } catch (err: any) {
        toast.error(err?.message || "Couldn't generate commentary.");
        setSlides(buildSlides());
      }
      setStep(3);
      setActiveSlide(0);
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong generating commentary.");
      setSlides(buildSlides());
      setStep(3);
    } finally {
      setGenerating(false);
    }
  };

  const updateSlide = (idx: number, patch: Partial<DeckSlide>) => {
    setSlides((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const onExport = async () => {
    if (!metrics) return;
    setExporting(true);
    try {
      await exportDeck({
        eventName: eventName || "Event",
        client: client || "Client",
        themeId,
        slides,
        metrics,
      });
      setStep(4);
      toast.success("Deck exported.");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't export the deck.");
    } finally {
      setExporting(false);
    }
  };

  const reset = () => {
    setFiles([]); setDatasets([]); setMetrics(null); setSlides([]); setStep(1);
    setEventName(""); setClient(""); setTone("");
  };

  const steps = ["Ingest", "Brief", "Edit", "Export"];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="h-6 w-[2px] bg-accent" />
            <p className="text-display text-lg tracking-tight">{PRODUCT}</p>
          </div>
          <nav className="hidden items-center gap-8 text-xs uppercase tracking-[0.18em] text-muted-foreground md:flex">
            {steps.map((label, i) => (
              <span key={label} className={step >= (i + 1) ? "text-foreground" : ""}>
                {String(i + 1).padStart(2, "0")} · {label}
              </span>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-8 pb-24">
        {/* Hero */}
        <section className="border-b border-border py-20">
          <div className="grid gap-16 lg:grid-cols-[1.3fr_1fr] lg:items-end">
            <div>
              <p className="text-mono text-[11px] uppercase tracking-[0.28em] text-accent">Post-event analysis · automated</p>
              <h1 className="mt-6 text-display text-5xl leading-[1.05] sm:text-6xl">
                Raw event data in. <span className="text-muted-foreground">Client-ready deck out.</span>
              </h1>
              <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground">
                Drop your XLSX, CSV, PowerBI exports and survey PDFs. {PRODUCT} detects what's what,
                cleans the metrics, drafts slide-ready commentary in your tone, and exports a structured
                deck you can edit before sending.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Button size="lg" onClick={() => document.getElementById("ingest")?.scrollIntoView({ behavior: "smooth" })}>
                  Start a report <ArrowRight />
                </Button>
                <Button size="lg" variant="outline" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>
                  How it works
                </Button>
              </div>
            </div>
            <div className="lg:pl-8">
              <SlideCanvas
                themeId={themeId}
                client="ACME"
                eventName="Spring Activation"
                metrics={{
                  totals: { totalAttendees: 12480, totalRegistrations: 16200, totalSurveyResponses: 1320, totalRevenue: null, conversionRate: 0.77, avgDwellMinutes: 47.3, nps: 62, csat: 4.4 },
                  venues: [{ venue: "London", visitors: 5200, share: 0.42 }, { venue: "Manchester", visitors: 3700, share: 0.30 }, { venue: "Bristol", visitors: 3580, share: 0.28 }],
                  ageBuckets: [], topComments: [], warnings: [],
                }}
                slide={{ id: "demo", kind: "title", title: "Spring Activation 2025", subtitle: "Three cities. Twelve thousand visitors. One read-out." }}
              />
            </div>
          </div>
        </section>

        {/* Step 1: Ingest */}
        <section id="ingest" className="border-b border-border py-20">
          <SectionHeader number="01" title="Drop your raw event data" meta="XLSX · CSV · PDF · PowerBI exports" />
          <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <DropZone files={files} onFiles={setFiles} />
            <div className="space-y-4">
              <div className="border border-border p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Auto-detected</p>
                <ul className="mt-4 space-y-2 text-sm text-foreground">
                  <li>— Survey exports (NPS, CSAT, ratings, comments)</li>
                  <li>— Footfall logs (entries, scans, attendance per venue)</li>
                  <li>— Registrations vs attendance for show-up rate</li>
                  <li>— Demographics: age, venue, location</li>
                  <li>— Dwell time, transactions, revenue (if present)</li>
                </ul>
              </div>
              <Button onClick={onParse} disabled={!files.length || parsing} className="w-full" size="lg">
                {parsing ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {parsing ? "Cleaning data…" : "Clean & detect"}
              </Button>
            </div>
          </div>

          {datasets.length > 0 && (
            <div className="mt-10">
              <p className="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">Detected datasets</p>
              <DatasetSummary datasets={datasets} />
            </div>
          )}
        </section>

        {/* Step 2: Brief */}
        <AnimatePresence>
          {step >= 2 && metrics && (
            <motion.section
              key="brief"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-b border-border py-20"
            >
              <SectionHeader number="02" title="Brief & theme" meta={`${insights.length} insights surfaced`} />

              <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
                <div className="space-y-6 border border-border p-8">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="event">Event name</Label>
                      <Input id="event" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Spring Activation 2025" />
                    </div>
                    <div>
                      <Label htmlFor="client">Client</Label>
                      <Input id="client" value={client} onChange={(e) => setClient(e.target.value)} placeholder="ACME" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="tone">Tone of voice <span className="text-muted-foreground">(optional)</span></Label>
                    <Textarea id="tone" rows={3} value={tone} onChange={(e) => setTone(e.target.value)}
                      placeholder="Confident senior strategist. Plain English. UK spelling. Lead with numbers. No buzzwords." />
                    <p className="mt-2 text-xs text-muted-foreground">Shapes how the AI drafts commentary for the deck.</p>
                  </div>

                  <div>
                    <Label>Deck theme</Label>
                    <div className="mt-3"><ThemePicker value={themeId} onChange={setThemeId} /></div>
                  </div>

                  <Button size="lg" onClick={onGenerate} disabled={generating} className="w-full">
                    {generating ? <Loader2 className="animate-spin" /> : <Wand2 />}
                    {generating ? "Drafting commentary…" : "Generate draft deck"}
                  </Button>
                </div>

                <div className="border border-border p-8">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Cleaned summary</p>
                  <div className="mt-6 grid grid-cols-2 gap-6">
                    <Stat label="Attendees" value={fmt(metrics.totals.totalAttendees)} />
                    <Stat label="Registrations" value={fmt(metrics.totals.totalRegistrations)} />
                    <Stat label="Show-up rate" value={metrics.totals.conversionRate !== null ? `${(metrics.totals.conversionRate * 100).toFixed(1)}%` : "—"} />
                    <Stat label="Survey responses" value={fmt(metrics.totals.totalSurveyResponses)} />
                    <Stat label="NPS" value={metrics.totals.nps !== null ? String(metrics.totals.nps) : "—"} />
                    <Stat label="Avg dwell (min)" value={metrics.totals.avgDwellMinutes !== null ? metrics.totals.avgDwellMinutes.toFixed(1) : "—"} />
                  </div>
                  {metrics.warnings.length > 0 && (
                    <ul className="mt-6 space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
                      {metrics.warnings.map((w) => <li key={w}>— {w}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Step 3: Edit slides */}
        <AnimatePresence>
          {step >= 3 && metrics && slides.length > 0 && (
            <motion.section
              key="edit"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-b border-border py-20"
            >
              <div className="flex items-end justify-between gap-6">
                <SectionHeader number="03" title="Edit & refine" meta={`Slide ${activeSlide + 1} of ${slides.length}`} />
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={onGenerate} disabled={generating}>
                    {generating ? <Loader2 className="animate-spin" /> : <RefreshCw />} Re-draft
                  </Button>
                  <Button onClick={onExport} disabled={exporting}>
                    {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                    {exporting ? "Exporting…" : "Export PPTX"}
                  </Button>
                </div>
              </div>

              <div className="mt-10 grid gap-8 lg:grid-cols-[200px_1fr_340px]">
                {/* Slide nav */}
                <ul className="space-y-px border-l border-border">
                  {slides.map((s, i) => (
                    <li key={s.id}>
                      <button
                        onClick={() => setActiveSlide(i)}
                        className={`relative w-full px-4 py-3 text-left text-sm transition ${
                          i === activeSlide
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                        }`}
                      >
                        {i === activeSlide && <span className="absolute -left-px top-0 h-full w-[2px] bg-accent" />}
                        <span className="text-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                        <span className="ml-3">{s.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Canvas */}
                <SlideCanvas
                  themeId={themeId}
                  client={client || "Client"}
                  eventName={eventName || "Event"}
                  metrics={metrics}
                  slide={slides[activeSlide]}
                />

                {/* Inline editor */}
                <div className="space-y-4 border border-border p-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Inline edit</p>
                  <div>
                    <Label>Eyebrow / title</Label>
                    <Input value={slides[activeSlide].title} onChange={(e) => updateSlide(activeSlide, { title: e.target.value })} />
                  </div>
                  <div>
                    <Label>Headline</Label>
                    <Input value={slides[activeSlide].subtitle ?? ""} onChange={(e) => updateSlide(activeSlide, { subtitle: e.target.value })} />
                  </div>
                  {slides[activeSlide].kind !== "title" && slides[activeSlide].kind !== "voices" && (
                    <div>
                      <Label>Commentary {slides[activeSlide].kind === "insights" || slides[activeSlide].kind === "commentary" ? "(one bullet per line)" : ""}</Label>
                      <Textarea
                        rows={9}
                        value={slides[activeSlide].body ?? ""}
                        onChange={(e) => updateSlide(activeSlide, { body: e.target.value })}
                      />
                    </div>
                  )}
                  <p className="border-t border-border pt-4 text-xs text-muted-foreground">Edits reflect live in the preview and the exported PPTX.</p>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Step 4: Done */}
        <AnimatePresence>
          {step === 4 && (
            <motion.section
              key="done"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-b border-border py-20"
            >
              <div className="border-l-2 border-accent pl-6">
                <p className="text-display text-3xl">Deck downloaded.</p>
                <p className="mt-2 text-sm text-muted-foreground">Open it in PowerPoint or Keynote to fine-tune the final layout.</p>
                <div className="mt-6 flex gap-3">
                  <Button variant="outline" onClick={onExport} disabled={exporting}>Re-export</Button>
                  <Button onClick={reset}>Start a new report</Button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* How it works */}
        <section id="how" className="py-20">
          <SectionHeader number="—" title={`How ${PRODUCT} works`} />
          <div className="mt-10 grid gap-px bg-border sm:grid-cols-3">
            {[
              { n: "01", t: "Detect", d: "We sniff each file's headers and contents to classify it as survey, footfall, registrations, transactions or demographics." },
              { n: "02", t: "Clean", d: "Numbers normalised, currencies stripped, ages bucketed, venues aggregated, NPS / CSAT computed." },
              { n: "03", t: "Draft", d: "AI writes commentary in your tone — referencing actual numbers, not generic fluff. You edit before export." },
            ].map((c) => (
              <div key={c.n} className="bg-background p-8">
                <p className="text-mono text-xs text-accent">{c.n}</p>
                <p className="mt-3 text-display text-2xl">{c.t}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-8 text-xs text-muted-foreground">
          <p>{PRODUCT} · For analysts who'd rather train tone than clean spreadsheets.</p>
          <p className="text-mono uppercase tracking-[0.2em]">© {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
};

const SectionHeader = ({ number, title, meta }: { number: string; title: string; meta?: string }) => (
  <div className="flex items-end justify-between gap-6 border-b border-border pb-5">
    <div className="flex items-baseline gap-6">
      <span className="text-mono text-xs text-accent">{number}</span>
      <h2 className="text-display text-3xl">{title}</h2>
    </div>
    {meta && <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{meta}</p>}
  </div>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="border-l-2 border-border pl-4">
    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
    <p className="mt-2 text-display text-3xl">{value}</p>
  </div>
);

const fmt = (n: number | null) => (n === null || n === undefined ? "—" : n.toLocaleString());

export default Index;
