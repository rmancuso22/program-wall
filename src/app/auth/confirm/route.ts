import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { syncThemeCookie } from "@/lib/theme-sync";

// Email confirmation landing, used only when "Confirm email" is enabled in
// Supabase. Supports the token_hash email template and the PKCE ?code= flow.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (!ok) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }

  const { data } = await supabase.auth.getClaims();
  if (data?.claims.sub) await syncThemeCookie(supabase, data.claims.sub);

  return NextResponse.redirect(new URL(next, origin));
}
