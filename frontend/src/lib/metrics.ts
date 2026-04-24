import type { ParsedDataset } from "./parsers";

export interface VenueBreakdown { venue: string; visitors: number; share: number }
export interface AgeBucket { bucket: string; count: number; share: number }
export interface ComputedMetrics {
  totals: {
    totalAttendees: number;
    totalRegistrations: number;
    totalSurveyResponses: number;
    totalRevenue: number | null;
    conversionRate: number | null; // attendees / registrations
    avgDwellMinutes: number | null;
    nps: number | null;
    csat: number | null;
  };
  venues: VenueBreakdown[];
  ageBuckets: AgeBucket[];
  topComments: string[];
  warnings: string[];
}

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, ""));
  return isFinite(n) ? n : null;
};

const findKey = (headers: string[], patterns: RegExp[]): string | undefined =>
  headers.find((h) => patterns.some((p) => p.test(h.toLowerCase())));

function bucketAge(age: number): string {
  if (age < 18) return "<18";
  if (age < 25) return "18–24";
  if (age < 35) return "25–34";
  if (age < 45) return "35–44";
  if (age < 55) return "45–54";
  if (age < 65) return "55–64";
  return "65+";
}

export function computeMetrics(datasets: ParsedDataset[]): ComputedMetrics {
  const warnings: string[] = [];
  let totalAttendees = 0;
  let totalRegistrations = 0;
  let totalSurveyResponses = 0;
  let totalRevenue = 0;
  let revenueSeen = false;
  const venueMap = new Map<string, number>();
  const ageMap = new Map<string, number>();
  let dwellSum = 0, dwellCount = 0;
  let npsPromoters = 0, npsDetractors = 0, npsTotal = 0;
  let csatSum = 0, csatCount = 0;
  const comments: string[] = [];

  for (const ds of datasets) {
    if (!ds.rows.length) continue;
    const headers = ds.headers;
    const venueKey = findKey(headers, [/venue/, /location/, /site/]);
    const visitorsKey = findKey(headers, [/visitor/, /footfall/, /entries/, /attendance/, /count/, /scans/, /checkin/]);
    const ageKey = findKey(headers, [/^age$/, /age( |_)?group/, /age( |_)?range/]);
    const dwellKey = findKey(headers, [/dwell/, /time( |_)?spent/, /duration/, /stay/]);
    const npsKey = findKey(headers, [/nps/, /likely.*recommend/, /recommend/]);
    const csatKey = findKey(headers, [/csat/, /satisfaction/, /^rating$/]);
    const commentKey = findKey(headers, [/comment/, /feedback/, /verbatim/, /open.*end/]);
    const revenueKey = findKey(headers, [/revenue/, /sales/, /amount/, /total/, /price/, /spend/]);

    if (ds.kind === "survey") totalSurveyResponses += ds.rows.length;
    if (ds.kind === "registrations") totalRegistrations += ds.rows.length;

    for (const row of ds.rows) {
      // Venue & footfall
      if (venueKey) {
        const v = String(row[venueKey] ?? "").trim();
        const visitors = visitorsKey ? num(row[visitorsKey]) ?? 1 : 1;
        if (v) venueMap.set(v, (venueMap.get(v) ?? 0) + visitors);
        if (ds.kind === "footfall") totalAttendees += visitors;
      } else if (ds.kind === "footfall" && visitorsKey) {
        totalAttendees += num(row[visitorsKey]) ?? 0;
      }

      // Age
      if (ageKey) {
        const raw = row[ageKey];
        const n = num(raw);
        const bucket = n !== null ? bucketAge(n) : String(raw ?? "").trim();
        if (bucket) ageMap.set(bucket, (ageMap.get(bucket) ?? 0) + 1);
      }

      // Dwell
      if (dwellKey) {
        const n = num(row[dwellKey]);
        if (n !== null) { dwellSum += n; dwellCount++; }
      }

      // NPS
      if (npsKey) {
        const n = num(row[npsKey]);
        if (n !== null && n >= 0 && n <= 10) {
          npsTotal++;
          if (n >= 9) npsPromoters++;
          else if (n <= 6) npsDetractors++;
        }
      }

      // CSAT
      if (csatKey) {
        const n = num(row[csatKey]);
        if (n !== null) { csatSum += n; csatCount++; }
      }

      // Comments
      if (commentKey) {
        const c = String(row[commentKey] ?? "").trim();
        if (c.length > 12 && c.length < 320) comments.push(c);
      }

      // Revenue
      if (revenueKey) {
        const n = num(row[revenueKey]);
        if (n !== null) { totalRevenue += n; revenueSeen = true; }
      }
    }
  }

  if (!totalAttendees && venueMap.size) {
    totalAttendees = [...venueMap.values()].reduce((a, b) => a + b, 0);
  }

  const venuesArr = [...venueMap.entries()]
    .map(([venue, visitors]) => ({ venue, visitors, share: 0 }))
    .sort((a, b) => b.visitors - a.visitors);
  const venuesTotal = venuesArr.reduce((a, b) => a + b.visitors, 0) || 1;
  venuesArr.forEach((v) => (v.share = v.visitors / venuesTotal));

  const ageOrder = ["<18", "18–24", "25–34", "35–44", "45–54", "55–64", "65+"];
  const ageArr = [...ageMap.entries()]
    .map(([bucket, count]) => ({ bucket, count, share: 0 }))
    .sort((a, b) => (ageOrder.indexOf(a.bucket) - ageOrder.indexOf(b.bucket)) || b.count - a.count);
  const ageTotal = ageArr.reduce((a, b) => a + b.count, 0) || 1;
  ageArr.forEach((a) => (a.share = a.count / ageTotal));

  const conversionRate = totalRegistrations > 0 ? totalAttendees / totalRegistrations : null;
  const nps = npsTotal > 0 ? Math.round(((npsPromoters - npsDetractors) / npsTotal) * 100) : null;
  const csat = csatCount > 0 ? csatSum / csatCount : null;

  if (!datasets.some((d) => d.kind === "footfall")) warnings.push("No footfall dataset detected — totals inferred from venue rows.");
  if (!datasets.some((d) => d.kind === "survey")) warnings.push("No survey dataset detected — NPS/CSAT unavailable.");

  return {
    totals: {
      totalAttendees,
      totalRegistrations,
      totalSurveyResponses,
      totalRevenue: revenueSeen ? totalRevenue : null,
      conversionRate,
      avgDwellMinutes: dwellCount ? dwellSum / dwellCount : null,
      nps,
      csat,
    },
    venues: venuesArr.slice(0, 8),
    ageBuckets: ageArr,
    topComments: comments.slice(0, 8),
    warnings,
  };
}

export function buildInsights(m: ComputedMetrics): string[] {
  const ins: string[] = [];
  const t = m.totals;
  if (t.totalAttendees) ins.push(`Total attendance reached ${t.totalAttendees.toLocaleString()} across ${m.venues.length || 1} venue(s).`);
  if (t.conversionRate !== null) ins.push(`Show-up rate landed at ${(t.conversionRate * 100).toFixed(1)}% (attendees / registrations).`);
  if (m.venues[0]) ins.push(`${m.venues[0].venue} led with ${(m.venues[0].share * 100).toFixed(0)}% of footfall.`);
  if (m.ageBuckets[0]) {
    const top = [...m.ageBuckets].sort((a, b) => b.count - a.count)[0];
    ins.push(`Audience skews ${top.bucket} (${(top.share * 100).toFixed(0)}% of respondents).`);
  }
  if (t.avgDwellMinutes !== null) ins.push(`Average dwell time was ${t.avgDwellMinutes.toFixed(1)} minutes per visitor.`);
  if (t.nps !== null) ins.push(`NPS = ${t.nps} from ${t.totalSurveyResponses.toLocaleString()} responses.`);
  if (t.csat !== null) ins.push(`CSAT averaged ${t.csat.toFixed(2)}.`);
  if (t.totalRevenue !== null) ins.push(`Tracked revenue reached ${t.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`);
  return ins;
}
