import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import { Upload, FileSpreadsheet, FileText, FileType2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UploadedFile {
  id: string;
  file: File;
}

interface DropZoneProps {
  files: UploadedFile[];
  onFiles: (files: UploadedFile[]) => void;
}

const iconFor = (name: string) => {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return FileType2;
  if (n.endsWith(".csv") || n.endsWith(".tsv")) return FileText;
  return FileSpreadsheet;
};

export const DropZone = ({ files, onFiles }: DropZoneProps) => {
  const [bumping, setBumping] = useState(false);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const next: UploadedFile[] = accepted.map((f) => ({ id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`, file: f }));
      onFiles([...files, ...next]);
      setBumping(true);
      setTimeout(() => setBumping(false), 400);
    },
    [files, onFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "text/tab-separated-values": [".tsv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "application/pdf": [".pdf"],
    },
    multiple: true,
  });

  const removeFile = (id: string) => onFiles(files.filter((f) => f.id !== id));

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "relative overflow-hidden rounded-2xl border border-dashed border-border/70 px-8 py-14 text-center transition-all cursor-pointer glass",
          isDragActive && "border-primary/60 shadow-glow",
          bumping && "animate-fade-up",
        )}
      >
        <input {...getInputProps()} />
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/30">
            <Upload className="h-6 w-6" />
          </div>
          <p className="text-display text-2xl">
            {isDragActive ? "Drop the mess. We'll sort it." : "Drop raw event data"}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            XLSX, CSV, TSV or PDF. Survey exports, footfall logs, registrations, transactions — mix and match. We auto-detect each.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-mono text-muted-foreground/80">
            <span className="rounded-full border border-border/70 px-2 py-0.5">.xlsx</span>
            <span className="rounded-full border border-border/70 px-2 py-0.5">.csv</span>
            <span className="rounded-full border border-border/70 px-2 py-0.5">.pdf</span>
            <span className="rounded-full border border-border/70 px-2 py-0.5">PowerBI export</span>
          </div>
        </motion.div>
      </div>

      {files.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {files.map((f) => {
            const Icon = iconFor(f.file.name);
            return (
              <li
                key={f.id}
                className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/60 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{f.file.name}</p>
                    <p className="text-mono text-[10px] text-muted-foreground">{(f.file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(f.id);
                  }}
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
