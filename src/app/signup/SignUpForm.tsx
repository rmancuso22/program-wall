"use client";

import { useActionState } from "react";
import { Button, InlineNotification, PasswordInput, TextInput } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { signUp } from "@/app/auth/actions";
import { FormNotice } from "@/components/FormNotice";
import { MIN_PASSWORD_LENGTH, type AuthFormState } from "@/lib/auth-errors";
import styles from "@/components/AuthCard.module.scss";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signUp, {
    status: "idle",
  });
  const errors = state.fieldErrors ?? {};

  if (state.status === "sent") {
    return (
      <InlineNotification
        kind="success"
        lowContrast
        hideCloseButton
        title="Check your email."
        subtitle={`We sent a confirmation link to ${state.email}. Open it to finish signing up.`}
      />
    );
  }

  return (
    <form action={formAction} className={styles.form} noValidate>
      <FormNotice state={state} />
      <TextInput
        id="name"
        name="name"
        labelText="Name (optional)"
        helperText="Shown to people on your projects."
        autoComplete="name"
        maxLength={100}
        invalid={Boolean(errors.name)}
        invalidText={errors.name}
      />
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
        helperText={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        autoComplete="new-password"
        invalid={Boolean(errors.password)}
        invalidText={errors.password}
      />
      <PasswordInput
        id="confirm"
        name="confirm"
        labelText="Confirm password"
        autoComplete="new-password"
        invalid={Boolean(errors.confirm)}
        invalidText={errors.confirm}
      />
      <Button type="submit" renderIcon={ArrowRight} disabled={pending} className={styles.submit}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
