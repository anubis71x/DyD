import { Cormorant_Garamond, Figtree } from "next/font/google";

/** Headings, storyteller narration and the brand. */
export const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

/** Everything else. */
export const bodyFont = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});
