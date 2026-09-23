import "server-only";
import { cookies } from "next/headers";

export const TZ_COOKIE = "pw-tz";

/**
 * The viewer's local calendar date (YYYY-MM-DD). The browser reports its time
 * zone in the pw-tz cookie (TimezoneSync); until it has, fall back to UTC.
 */
export async function getToday() {
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  const now = new Date();
  if (tz) {
    try {
      // en-CA formats as YYYY-MM-DD.
      return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
    } catch {
      // Unknown zone name: fall through.
    }
  }
  return now.toISOString().slice(0, 10);
}
