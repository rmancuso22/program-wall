import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { THEME_COOKIE } from "@/lib/theme";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
  response.cookies.delete(THEME_COOKIE);
  return response;
}
