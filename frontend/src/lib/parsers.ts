import * as XLSX from "xlsx";
import Papa from "papaparse";

export type DatasetKind = "survey" | "footfall" | "registrations" | "transactions" | "demographics" | "unknown";

export interface ParsedDataset {
  fileName: string;
  sheetName?: string;
  kind: DatasetKind;
  headers: string[];
  rows: Record<string, any>[];
  raw?: string;
}

const SURVEY_HINTS = [
  "nps", "rating", "satisfaction", "csat", "feedback", "would you recommend",
  "how likely", "comment", "response", "question",
];
const FOOTFALL_HINTS = ["footfall", "visitors", "entries", "scans", "checkins", "check-in", "attendance", "head count", "people in"];
const REG_HINTS = ["registrant", "registration", "ticket", "rsvp", "attendee", "guest"];
const TXN_HINTS = ["transaction", "order", "purchase", "revenue", "sales", "amount", "price", "spend", "conversion"];
const DEMO_HINTS = ["age", "gender", "city", "region", "country", "venue", "location"];

function score(headersLower: string, hints: string[]) {
  return hints.reduce((acc, h) => acc + (headersLower.includes(h) ? 1 : 0), 0);
}

export function detectKind(headers: string[], fileName: string): DatasetKind {
  const h = headers.join("|").toLowerCase() + "|" + fileName.toLowerCase();
  const scores: [DatasetKind, number][] = [
    ["survey", score(h, SURVEY_HINTS)],
    ["footfall", score(h, FOOTFALL_HINTS)],
    ["registrations", score(h, REG_HINTS)],
    ["transactions", score(h, TXN_HINTS)],
    ["demographics", score(h, DEMO_HINTS)],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : "unknown";
}

function normalizeRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    out[String(k).trim()] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

export async function parseFile(file: File): Promise<ParsedDataset[]> {
  const name = file.name;
  const lower = name.toLowerCase();

  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    const text = await file.text();
    const result = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
    const rows = (result.data as Record<string, any>[]).map(normalizeRow).filter((r) => Object.keys(r).length);
    const headers = result.meta.fields ?? Object.keys(rows[0] ?? {});
    return [{ fileName: name, kind: detectKind(headers, name), headers, rows }];
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    return wb.SheetNames.map((sheetName) => {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null }).map(normalizeRow);
      const headers = rows.length ? Object.keys(rows[0]) : [];
      return { fileName: name, sheetName, kind: detectKind(headers, `${name} ${sheetName}`), headers, rows };
    }).filter((d) => d.rows.length);
  }

  if (lower.endsWith(".pdf")) {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it: any) => it.str).join(" ") + "\n";
    }
    return [{
      fileName: name,
      kind: "unknown",
      headers: [],
      rows: [],
      raw: text.slice(0, 20000),
    }];
  }

  throw new Error(`Unsupported file type: ${name}`);
}
