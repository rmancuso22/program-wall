"use client";

import { useRef, type ReactNode } from "react";
import { Header, HeaderGlobalAction, HeaderGlobalBar, HeaderName } from "@carbon/react";
import { Logout } from "@carbon/icons-react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import type { ThemePref } from "@/lib/theme";
import styles from "./AppHeader.module.scss";

type Props = {
  themePref: ThemePref;
  /** Rendered after the product name, e.g. the board name. */
  context?: ReactNode;
  /** Rendered at the start of the global bar, e.g. presence and Share. */
  actions?: ReactNode;
};

export function AppHeader({ themePref, context, actions }: Props) {
  const signOutForm = useRef<HTMLFormElement>(null);

  return (
    <Header aria-label="IBM Program Wall">
      <HeaderName href="/boards" prefix="IBM">
        Program Wall
      </HeaderName>
      {context && <div className={styles.context}>{context}</div>}
      <HeaderGlobalBar>
        {actions && <div className={styles.actions}>{actions}</div>}
        <ThemeSwitcher current={themePref} />
        <form ref={signOutForm} action="/auth/signout" method="post" className={styles.signout}>
          <HeaderGlobalAction
            aria-label="Sign out"
            tooltipAlignment="end"
            onClick={() => signOutForm.current?.requestSubmit()}
          >
            <Logout size={20} />
          </HeaderGlobalAction>
        </form>
      </HeaderGlobalBar>
    </Header>
  );
}
