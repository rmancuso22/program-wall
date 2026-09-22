import type { AuthError } from "@supabase/supabase-js";

export const MIN_PASSWORD_LENGTH = 8;

export type FieldErrors = { email?: string; password?: string; confirm?: string; name?: string };

export type AuthFormState = {
  status: "idle" | "error" | "sent";
  formError?: { title: string; subtitle?: string };
  fieldErrors?: FieldErrors;
  email?: string;
};

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? undefined : "Enter a valid email address.";
}

export function validateNewPassword(password: string) {
  return password.length >= MIN_PASSWORD_LENGTH
    ? undefined
    : `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
}

function weakPasswordMessage(error: AuthError) {
  const reasons = "reasons" in error ? (error.reasons as string[] | undefined) : undefined;
  if (reasons?.includes("pwned")) {
    return "This password has appeared in a data breach. Choose a different one.";
  }
  if (reasons?.includes("characters")) {
    return "Mix upper and lower case letters, digits and symbols.";
  }
  return `Password is too weak. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
}

// Translate a Supabase auth error into form state. Unknown codes fall back to
// Supabase's own message so nothing is silently swallowed.
export function mapAuthError(error: AuthError, email?: string): AuthFormState {
  const base = { status: "error" as const, email };
  switch (error.code) {
    case "invalid_credentials":
      // Supabase deliberately returns the same code for an unknown email and
      // a wrong password, so the two cannot be told apart safely.
      return {
        ...base,
        formError: {
          title: "Email or password is incorrect.",
          subtitle: "Check both, or create an account if you have not signed up yet.",
        },
        fieldErrors: { password: "Email or password is incorrect." },
      };
    case "email_not_confirmed":
      return {
        ...base,
        formError: {
          title: "Confirm your email first.",
          subtitle: "Open the confirmation link we emailed you, then sign in.",
        },
      };
    case "weak_password":
      return { ...base, fieldErrors: { password: weakPasswordMessage(error) } };
    case "same_password":
      return { ...base, fieldErrors: { password: "Choose a password you have not used here before." } };
    case "user_already_exists":
    case "email_exists":
      return {
        ...base,
        fieldErrors: { email: "An account with this email already exists. Sign in instead." },
      };
    case "email_address_invalid":
      return { ...base, fieldErrors: { email: "Enter a valid email address." } };
    case "signup_disabled":
      return { ...base, formError: { title: "Sign up is currently closed." } };
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return {
        ...base,
        formError: { title: "Too many attempts.", subtitle: "Wait a minute and try again." },
      };
    default:
      return { ...base, formError: { title: "Something went wrong.", subtitle: error.message } };
  }
}
