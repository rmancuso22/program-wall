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

/** The Liftoff mark. The one place rocket imagery is allowed: the header brand. */
export function BrandMark() {
  return (
    <svg className={styles.logo} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1c2.2 1.4 3.4 3.8 3.4 6.6v2.1l1.6 1.6V14l-2.6-1.3H5.6L3 14v-2.7l1.6-1.6V7.6C4.6 4.8 5.8 2.4 8 1zm0 4.2a1.3 1.3 0 100 2.6 1.3 1.3 0 000-2.6zM6.6 13.6h2.8L8 15.4z" />
    </svg>
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
