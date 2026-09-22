"use client";

import { InlineNotification } from "@carbon/react";
import type { AuthFormState } from "@/lib/auth-errors";

export function FormNotice({ state }: { state: AuthFormState }) {
  if (!state.formError) return null;
  return (
    <InlineNotification
      kind="error"
      lowContrast
      hideCloseButton
      role="alert"
      title={state.formError.title}
      subtitle={state.formError.subtitle}
    />
  );
}
