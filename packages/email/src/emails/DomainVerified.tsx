import {Heading, Link, Section, Text} from '@react-email/components';
import * as React from 'react';
import {EmailLayout} from '../common/EmailLayout';
import {Footer} from '../common/Footer';
import {Header} from '../common/Header';

interface DomainVerifiedEmailProps {
  projectName: string;
  projectId: string;
  domain: string;
  dashboardUrl?: string;
}

export function DomainVerifiedEmail({
  projectName = 'My Project',
  projectId = 'proj_example123',
  domain = 'example.com',
  dashboardUrl = 'https://next-app.useplunk.com',
}: DomainVerifiedEmailProps) {
  return (
    <EmailLayout>
      <Header />

      <Section className="px-8 pb-10 pt-10">
        <Heading className="mb-2 mt-0 text-2xl font-semibold tracking-tight text-gray-900">
          Domain verified successfully
        </Heading>

        <Text className="mb-8 mt-0 text-base leading-relaxed text-gray-600">
          Your domain <strong className="font-medium text-gray-900">{domain}</strong> for project{' '}
          <strong className="font-medium text-gray-900">{projectName}</strong> has been successfully verified and is now
          ready to send emails.
        </Text>

        <Section className="mb-8 rounded-lg bg-gray-50 px-6 py-4" style={{border: '1px solid #e5e7eb'}}>
          <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-700">
            Your domain is now active and can be used to send emails. You can start using it in your templates and
            campaigns immediately.
          </Text>
        </Section>

        <Heading className="mb-4 mt-0 text-lg font-semibold text-gray-900">Next steps</Heading>

        <Section className="mb-8">
          <Section className="mb-3">
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Start sending emails</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              Use this domain in your templates and campaigns
            </Text>
          </Section>

          <Section className="mb-3">
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Configure email addresses</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              Set up sender addresses with this domain for your emails
            </Text>
          </Section>

          <Section>
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Review DNS settings</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              Ensure your DNS settings remain in place to maintain verification
            </Text>
          </Section>
        </Section>

        <Section className="mb-6">
          <Link
            href={`${dashboardUrl}/settings?tab=domains`}
            className="inline-block rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white no-underline"
          >
            View domain settings
          </Link>
        </Section>

        <Section>
          <Link href={dashboardUrl} className="text-sm text-gray-500" style={{textDecoration: 'none'}}>
            View project dashboard →
          </Link>
        </Section>
      </Section>

      <Footer projectId={projectId} />
    </EmailLayout>
  );
}

export default DomainVerifiedEmail;
