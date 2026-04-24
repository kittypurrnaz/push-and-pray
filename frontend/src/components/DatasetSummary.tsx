import type { ParsedDataset } from "@/lib/parsers";
import { FileSpreadsheet, FileText, FileType2 } from "lucide-react";

const KIND_LABEL: Record<string, string> = {
  survey: "Survey responses",
  footfall: "Footfall log",
  registrations: "Registrations",
  transactions: "Transactions",
  demographics: "Demographics",
  unknown: "Unclassified",
};

const KIND_TONE: Record<string, string> = {
  survey: "bg-accent/15 text-accent border-accent/30",
  footfall: "bg-primary/15 text-primary border-primary/30",
  registrations: "bg-blue-500/15 text-blue-300 border-blue-400/30",
  transactions: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  demographics: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

export const DatasetSummary = ({ datasets }: { datasets: ParsedDataset[] }) => {
  if (!datasets.length) return null;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {datasets.map((d, i) => {
        const Icon = d.fileName.toLowerCase().endsWith(".pdf") ? FileType2 : d.fileName.toLowerCase().endsWith(".csv") ? FileText : FileSpreadsheet;
        return (
          <div key={`${d.fileName}-${d.sheetName ?? ""}-${i}`} className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <p className="truncate text-sm">{d.fileName}{d.sheetName ? ` · ${d.sheetName}` : ""}</p>
              </div>
              <p className="text-mono text-[10px] text-muted-foreground">
                {d.rows.length.toLocaleString()} rows · {d.headers.length} columns
              </p>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${KIND_TONE[d.kind]}`}>
              {KIND_LABEL[d.kind]}
            </span>
          </div>
        );
      })}
    </div>
  );
};
