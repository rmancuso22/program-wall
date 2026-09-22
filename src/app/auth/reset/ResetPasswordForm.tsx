"use client";

import { useActionState } from "react";
import { Button, PasswordInput } from "@carbon/react";
import { Checkmark } from "@carbon/icons-react";
import { resetPassword } from "@/app/auth/actions";
import { FormNotice } from "@/components/FormNotice";
import { MIN_PASSWORD_LENGTH, type AuthFormState } from "@/lib/auth-errors";
import styles from "@/components/AuthCard.module.scss";

export function ResetPasswordForm({ tokenHash, code }: { tokenHash: string; code: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(resetPassword, {
    status: "idle",
  });
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className={styles.form} noValidate>
      <FormNotice state={state} />
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="code" value={code} />
      <PasswordInput
        id="password"
        name="password"
        labelText="New password"
        helperText={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        autoComplete="new-password"
        invalid={Boolean(errors.password)}
        invalidText={errors.password}
      />
      <PasswordInput
        id="confirm"
        name="confirm"
        labelText="Confirm new password"
        autoComplete="new-password"
        invalid={Boolean(errors.confirm)}
        invalidText={errors.confirm}
      />
      <Button type="submit" renderIcon={Checkmark} disabled={pending} className={styles.submit}>
        {pending ? "Saving…" : "Save password and sign in"}
      </Button>
    </form>
  );
}
