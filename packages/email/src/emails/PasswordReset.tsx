import {Heading, Link, Section, Text} from '@react-email/components';
import * as React from 'react';
import {EmailLayout} from '../common/EmailLayout';
import {Footer} from '../common/Footer';
import {Header} from '../common/Header';

interface PasswordResetEmailProps {
  email: string;
  resetUrl: string;
}

export function PasswordResetEmail({
  email = 'user@example.com',
  resetUrl = 'https://next-app.useplunk.com/auth/reset-password?token=abc123',
}: PasswordResetEmailProps) {
  return (
    <EmailLayout>
      <Header />

      <Section className="px-8 pb-10 pt-10">
        <Heading className="mb-2 mt-0 text-2xl font-semibold tracking-tight text-gray-900">Reset your password</Heading>

        <Text className="mb-8 mt-0 text-base leading-relaxed text-gray-600">
          We received a request to reset your password. Click the button below to create a new password.
        </Text>

        <Section className="mb-8">
          <Link
            href={resetUrl}
            className="inline-block rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white no-underline"
          >
            Reset password
          </Link>
        </Section>

        <Section className="mb-8 rounded-lg bg-amber-50 px-6 py-4" style={{border: '1px solid #fbbf24'}}>
          <Text className="mb-0 mt-0 text-sm leading-relaxed text-amber-900">
            This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </Text>
        </Section>

        <Section className="mb-8 rounded-lg bg-gray-50 px-6 py-4" style={{border: '1px solid #e5e7eb'}}>
          <Text className="mb-2 mt-0 text-xs font-medium uppercase tracking-wider text-gray-500">
            Or copy this link
          </Text>
          <Text className="mb-0 mt-0 break-all text-sm text-gray-600">{resetUrl}</Text>
        </Section>
      </Section>

      <Footer />
    </EmailLayout>
  );
}

export default PasswordResetEmail;
