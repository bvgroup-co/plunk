import {Heading, Link, Section, Text} from '@react-email/components';
import * as React from 'react';
import {EmailLayout} from '../common/EmailLayout';
import {Footer} from '../common/Footer';
import {Header} from '../common/Header';

interface EmailVerificationEmailProps {
  email: string;
  verificationUrl: string;
}

export function EmailVerificationEmail({
  email = 'user@example.com',
  verificationUrl = 'https://api.useplunk.com/auth/verify-email?token=abc123',
}: EmailVerificationEmailProps) {
  return (
    <EmailLayout>
      <Header />

      <Section className="px-8 pb-10 pt-10">
        <Heading className="mb-2 mt-0 text-2xl font-semibold tracking-tight text-gray-900">
          Verify your email address
        </Heading>

        <Text className="mb-8 mt-0 text-base leading-relaxed text-gray-600">
          Thanks for signing up! Please verify your email address to get started with Plunk.
        </Text>

        <Section className="mb-8">
          <Link
            href={verificationUrl}
            className="inline-block rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white no-underline"
          >
            Verify email address
          </Link>
        </Section>

        <Section className="mb-8 rounded-lg bg-gray-50 px-6 py-4" style={{border: '1px solid #e5e7eb'}}>
          <Text className="mb-2 mt-0 text-xs font-medium uppercase tracking-wider text-gray-500">
            Or copy this link
          </Text>
          <Text className="mb-0 mt-0 break-all text-sm text-gray-600">{verificationUrl}</Text>
        </Section>

        <Text className="mb-0 mt-0 text-sm text-gray-500">
          This link will expire in 1 hour. If you didn't sign up for Plunk, you can safely ignore this email.
        </Text>
      </Section>

      <Footer />
    </EmailLayout>
  );
}

export default EmailVerificationEmail;
