import NextLink from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { PRODUCT } from "@/lib/config";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = { title: `Choose a new password · ${PRODUCT.name}` };

// Landing page for the password recovery email. Accepts the token_hash email
// template (works on any device) or the default PKCE ?code= redirect.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; code?: string }>;
}) {
  const { token_hash: tokenHash, type, code } = await searchParams;
  const hasToken = (tokenHash && type === "recovery") || code;

  if (!hasToken) {
    return (
      <AuthCard
        title="This reset link is not valid"
        lede="It may have expired or already been used. Reset links last one hour."
        footer={<NextLink href="/login">Back to sign in</NextLink>}
      >
        <NextLink href="/forgot-password" className="cds--link">
          Request a new reset link
        </NextLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <ResetPasswordForm tokenHash={tokenHash ?? ""} code={code ?? ""} />
    </AuthCard>
  );
}
