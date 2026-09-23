"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { requestOrigin } from "@/lib/request-origin";
import { syncThemeCookie } from "@/lib/theme-sync";
import {
  mapAuthError,
  validateEmail,
  validateNewPassword,
  type AuthFormState,
} from "@/lib/auth-errors";

function readEmail(formData: FormData) {
  return String(formData.get("email") ?? "").trim().toLowerCase();
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  const emailError = validateEmail(email);
  if (emailError || !password) {
    return {
      status: "error",
      email,
      fieldErrors: { email: emailError, password: password ? undefined : "Enter your password." },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return mapAuthError(error, email);

  await syncThemeCookie(supabase, data.user.id);
  redirect(next);
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = readEmail(formData);
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fieldErrors = {
    name: name.length > 100 ? "Keep your name under 100 characters." : undefined,
    email: validateEmail(email),
    password: validateNewPassword(password),
    confirm: password === confirm ? undefined : "Passwords do not match.",
  };
  if (Object.values(fieldErrors).some(Boolean)) {
    return { status: "error", email, fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the on_auth_user_created trigger into profiles.display_name.
      data: name ? { full_name: name } : undefined,
      // Only used when email confirmation is enabled in Supabase.
      emailRedirectTo: `${await requestOrigin()}/auth/confirm?next=/roadmap`,
    },
  });
  if (error) return mapAuthError(error, email);

  // Email confirmation off: signUp returns a session and the user is in.
  if (data.session) {
    await syncThemeCookie(supabase, data.session.user.id);
    redirect("/roadmap");
  }

  // Email confirmation on: no session until the link is opened. Supabase also
  // lands here (without an error) for an already-registered email, so the
  // message must not reveal which case it is.
  return { status: "sent", email };
}

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readEmail(formData);
  const emailError = validateEmail(email);
  if (emailError) return { status: "error", email, fieldErrors: { email: emailError } };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await requestOrigin()}/auth/reset`,
  });
  if (error) return mapAuthError(error, email);

  // Same response whether or not the account exists.
  return { status: "sent", email };
}

export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const tokenHash = String(formData.get("token_hash") ?? "");
  const code = String(formData.get("code") ?? "");

  // Validate before spending the one-time token.
  const fieldErrors = {
    password: validateNewPassword(password),
    confirm: password === confirm ? undefined : "Passwords do not match.",
  };
  if (fieldErrors.password || fieldErrors.confirm) return { status: "error", fieldErrors };

  const supabase = await createClient();

  // The token is verified on submit rather than on page load, so email
  // scanners that prefetch links cannot burn it.
  let verified = false;
  if (tokenHash) {
    verified = !(await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash })).error;
  } else if (code) {
    verified = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  // A previous submit may have verified the token and then failed on the
  // password itself (e.g. weak_password). That left a recovery session, so
  // allow the retry on it.
  if (!verified) {
    const { data } = await supabase.auth.getClaims();
    const amr = (data?.claims.amr ?? []) as { method: string }[];
    verified = amr.some((entry) => entry.method === "recovery");
  }

  if (!verified) {
    return {
      status: "error",
      formError: {
        title: "This reset link has expired or was already used.",
        subtitle: "Request a new one from the sign in page.",
      },
    };
  }

  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) return mapAuthError(error);

  await syncThemeCookie(supabase, data.user.id);
  redirect("/roadmap");
}
