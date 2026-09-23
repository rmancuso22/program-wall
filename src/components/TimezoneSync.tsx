"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const TZ_COOKIE = "pw-tz";

/** Tells the server the browser's time zone so "today" is the viewer's local date. */
export function TimezoneSync() {
  const router = useRouter();
  useEffect(() => {
    let tz: string;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    const current = document.cookie.split("; ").find((c) => c.startsWith(`${TZ_COOKIE}=`))?.split("=")[1];
    if (current && decodeURIComponent(current) === tz) return;
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}

/** The browser's local date, YYYY-MM-DD. */
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
