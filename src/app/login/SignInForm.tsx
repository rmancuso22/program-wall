"use client";

import { useActionState } from "react";
import NextLink from "next/link";
import { Button, InlineNotification, PasswordInput, TextInput } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { signIn } from "@/app/auth/actions";
import { FormNotice } from "@/components/FormNotice";
import type { AuthFormState } from "@/lib/auth-errors";
import styles from "@/components/AuthCard.module.scss";

export function SignInForm({ next, linkError }: { next: string; linkError: boolean }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signIn, {
    status: "idle",
  });
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className={styles.form} noValidate>
      {linkError && state.status === "idle" && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="That link did not work."
          subtitle="It may have expired or already been used."
        />
      )}
      <FormNotice state={state} />
      <input type="hidden" name="next" value={next} />
      <TextInput
        id="email"
        name="email"
        type="email"
        labelText="Email"
        autoComplete="email"
        defaultValue={state.email}
        invalid={Boolean(errors.email)}
        invalidText={errors.email}
      />
      <PasswordInput
        id="password"
        name="password"
        labelText="Password"
        autoComplete="current-password"
        invalid={Boolean(errors.password)}
        invalidText={errors.password}
      />
      <div className={styles.row}>
        <NextLink href="/forgot-password" className="cds--link">
          Forgot password?
        </NextLink>
      </div>
      <Button type="submit" renderIcon={ArrowRight} disabled={pending} className={styles.submit}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
