import type { Metadata } from "next";
import { plexMono, plexSans } from "./fonts";
import { getThemePref } from "@/lib/theme-server";
import { PRODUCT } from "@/lib/config";
import { TimezoneSync } from "@/components/TimezoneSync";
import "./globals.scss";

export const metadata: Metadata = {
  title: PRODUCT.name,
  description: PRODUCT.tagline,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The theme override lives in profiles.theme; this cookie mirrors it so the
  // first paint is correct without a database round trip.
  const themePref = await getThemePref();

  return (
    <html
      lang="en"
      data-theme-pref={themePref}
      className={`${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        <TimezoneSync />
        {children}
      </body>
    </html>
  );
}
