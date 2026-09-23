"use client";

import { useRef, type ReactNode } from "react";
import { Header, HeaderGlobalAction, HeaderGlobalBar, Theme } from "@carbon/react";
import { Logout } from "@carbon/icons-react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import type { ThemePref } from "@/lib/theme";
import styles from "./ShellHeader.module.scss";

type Props = {
  label: string;
  themePref: ThemePref;
  /** Left side: brand and scope, or the workspace back button and title. */
  children: ReactNode;
  /** Right side, before the theme toggle. */
  actions?: ReactNode;
};

// The shell stays dark in both themes, as in the design.
export function ShellHeader({ label, themePref, children, actions }: Props) {
  const signOutForm = useRef<HTMLFormElement>(null);

  return (
    <Theme theme="g100">
      <Header aria-label={label} className={styles.header}>
        <div className={styles.left}>{children}</div>
        <HeaderGlobalBar>
          {actions}
          <ThemeSwitcher current={themePref} />
          <form ref={signOutForm} action="/auth/signout" method="post" className={styles.contents}>
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
    </Theme>
  );
}

export function ShellDivider() {
  return <span className={styles.divider} aria-hidden="true" />;
}

export function ShellButton({
  children,
  primary,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button type="button" {...props} className={`${styles.shellBtn} ${primary ? styles.primary : ""}`}>
      {children}
    </button>
  );
}

export { styles as shellStyles };
