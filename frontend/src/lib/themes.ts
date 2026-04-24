export type ThemeId = "midnight" | "ember" | "atelier";

export interface SlideTheme {
  id: ThemeId;
  name: string;
  tagline: string;
  bg: string;          // hex without #
  fg: string;
  accent: string;
  muted: string;
  card: string;
  font: string;
  displayFont: string;
}

export const THEMES: Record<ThemeId, SlideTheme> = {
  midnight: {
    id: "midnight",
    name: "Midnight Executive",
    tagline: "Boardroom calm. Navy + ice.",
    bg: "0E1A33",
    fg: "F4F6FB",
    accent: "F2C14E",
    muted: "9AA8C7",
    card: "182645",
    font: "Inter",
    displayFont: "Georgia",
  },
  ember: {
    id: "ember",
    name: "Ember Bold",
    tagline: "Warm, editorial, brand-forward.",
    bg: "1A1208",
    fg: "FBF3E4",
    accent: "F26B3A",
    muted: "B89B7A",
    card: "2A1C0E",
    font: "Inter",
    displayFont: "Georgia",
  },
  atelier: {
    id: "atelier",
    name: "Atelier Minimal",
    tagline: "Quiet typography. Cream paper.",
    bg: "F4EFE6",
    fg: "1B1B1B",
    accent: "1B1B1B",
    muted: "6B6B6B",
    card: "FFFFFF",
    font: "Inter",
    displayFont: "Georgia",
  },
};

export const hex = (s: string) => `#${s.replace("#", "")}`;
