import NextLink from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { PRODUCT } from "@/lib/config";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = { title: `Reset password · ${PRODUCT.name}` };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      lede="Enter your email and we will send you a link to choose a new password."
      footer={<NextLink href="/login">Back to sign in</NextLink>}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
