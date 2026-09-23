"use client";

import { Button } from "@carbon/react";
import { Chat } from "@carbon/icons-react";
import { useCopy } from "@/components/Toast";

type Props = {
  name: string;
  slack: string;
  role: string;
  docTitle: string;
  prUrl: string | null;
  kind?: "button" | "link";
  className?: string;
};

// No Slack integration yet: copy a ready-to-paste nudge for the reviewer.
export function NudgeButton({ name, slack, role, docTitle, prUrl, kind = "button", className }: Props) {
  const copy = useCopy();
  const message = `${slack} gentle nudge: your ${role} review on "${docTitle}" is waiting${prUrl ? `: ${prUrl}` : "."}`;
  const onClick = () => copy(message, `Nudge for ${name} copied. Paste it into Slack.`);

  if (kind === "link") {
    return (
      <Button kind="ghost" size="sm" onClick={onClick} className={className}>
        Nudge
      </Button>
    );
  }
  return (
    <Button kind="tertiary" size="sm" renderIcon={Chat} onClick={onClick} className={className}>
      Nudge on Slack
    </Button>
  );
}
