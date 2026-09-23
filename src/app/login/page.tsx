import NextLink from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { PRODUCT } from "@/lib/config";
import { safeNext } from "@/lib/safe-next";
import { SignInForm } from "./SignInForm";

export const metadata = { title: `Sign in · ${PRODUCT.name}` };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          New to {PRODUCT.name}? <NextLink href="/signup">Create an account</NextLink>
        </>
      }
    >
      <SignInForm next={safeNext(next)} linkError={error === "link"} />
    </AuthCard>
  );
}
