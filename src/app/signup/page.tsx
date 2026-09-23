import NextLink from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { PRODUCT } from "@/lib/config";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: `Create account · ${PRODUCT.name}` };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create an account"
      footer={
        <>
          Already have an account? <NextLink href="/login">Sign in</NextLink>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
