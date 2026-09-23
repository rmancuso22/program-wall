import "server-only";
import { cookies } from "next/headers";

export const TZ_COOKIE = "pw-tz";

/** The viewer's IANA time zone from the pw-tz cookie, or UTC until it's known. */
export async function getViewerTz() {
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  if (tz) {
    try {
      const zone = decodeURIComponent(tz);
      new Intl.DateTimeFormat("en-CA", { timeZone: zone });
      return zone;
    } catch {}
  }
  return "UTC";
}

/**
 * The viewer's local calendar date (YYYY-MM-DD). The browser reports its time
 * zone in the pw-tz cookie (TimezoneSync); until it has, fall back to UTC.
 */
export async function getToday() {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: await getViewerTz() }).format(new Date());
}
