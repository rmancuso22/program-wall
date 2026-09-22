"use client";

import { useActionState } from "react";
import { Button, InlineNotification, TextInput } from "@carbon/react";
import { Email } from "@carbon/icons-react";
import { requestPasswordReset } from "@/app/auth/actions";
import { FormNotice } from "@/components/FormNotice";
import type { AuthFormState } from "@/lib/auth-errors";
import styles from "@/components/AuthCard.module.scss";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <InlineNotification
        kind="success"
        lowContrast
        hideCloseButton
        title="Check your email."
        subtitle={`If ${state.email} has an account, a reset link is on its way. It expires in one hour.`}
      />
    );
  }

  return (
    <form action={formAction} className={styles.form} noValidate>
      <FormNotice state={state} />
      <TextInput
        id="email"
        name="email"
        type="email"
        labelText="Email"
        autoComplete="email"
        defaultValue={state.email}
        invalid={Boolean(state.fieldErrors?.email)}
        invalidText={state.fieldErrors?.email}
      />
      <Button type="submit" renderIcon={Email} disabled={pending} className={styles.submit}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
