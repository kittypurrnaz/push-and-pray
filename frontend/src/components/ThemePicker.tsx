import { THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface ThemePickerProps {
  value: ThemeId;
  onChange: (id: ThemeId) => void;
}

export const ThemePicker = ({ value, onChange }: ThemePickerProps) => {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {(Object.values(THEMES)).map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "group relative overflow-hidden rounded-xl border p-3 text-left transition-all",
              active ? "border-primary shadow-glow" : "border-border/70 hover:border-border",
            )}
          >
            <div
              className="relative h-24 w-full overflow-hidden rounded-md"
              style={{ background: `#${t.bg}` }}
            >
              <div className="absolute left-3 top-3 h-2 w-10 rounded-full" style={{ background: `#${t.accent}` }} />
              <div className="absolute bottom-3 left-3 right-3 space-y-1">
                <div className="h-2 w-3/4 rounded" style={{ background: `#${t.fg}`, opacity: 0.85 }} />
                <div className="h-1.5 w-1/2 rounded" style={{ background: `#${t.muted}` }} />
              </div>
              <div className="absolute right-3 bottom-3 h-6 w-6 rounded-full" style={{ background: `#${t.card}`, border: `1px solid #${t.muted}` }} />
            </div>
            <div className="mt-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.tagline}</p>
              </div>
              {active && (
                <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
