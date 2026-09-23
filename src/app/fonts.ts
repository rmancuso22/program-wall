import { Inter, JetBrains_Mono } from "next/font/google";

// Inter for everything; JetBrains Mono only for project numbers, Jira keys and
// code (branch names). Numbers elsewhere use Inter with tabular figures.
export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
