import {Heading, Link, Section, Text} from '@react-email/components';
import * as React from 'react';
import {EmailLayout} from '../common/EmailLayout';
import {Footer} from '../common/Footer';
import {Header} from '../common/Header';

interface DomainUnverifiedEmailProps {
  projectName: string;
  projectId: string;
  domain: string;
  dashboardUrl?: string;
}

export function DomainUnverifiedEmail({
  projectName = 'My Project',
  projectId = 'proj_example123',
  domain = 'example.com',
  dashboardUrl = 'https://next-app.useplunk.com',
}: DomainUnverifiedEmailProps) {
  return (
    <EmailLayout>
      <Header />

      <Section className="px-8 pb-10 pt-10">
        <Heading className="mb-2 mt-0 text-2xl font-semibold tracking-tight text-gray-900">
          Domain verification failed
        </Heading>

        <Text className="mb-8 mt-0 text-base leading-relaxed text-gray-600">
          Your domain <strong className="font-medium text-gray-900">{domain}</strong> for project{' '}
          <strong className="font-medium text-gray-900">{projectName}</strong> is no longer verified. Email sending from
          this domain has been disabled.
        </Text>

        <Section className="mb-8 rounded-lg bg-red-50 px-6 py-4" style={{border: '1px solid #fca5a5'}}>
          <Text className="mb-0 mt-0 text-sm leading-relaxed text-red-900">
            Emails cannot be sent from this domain until verification is restored. Please check your DNS records and
            re-verify your domain.
          </Text>
        </Section>

        <Heading className="mb-4 mt-0 text-lg font-semibold text-gray-900">Common causes</Heading>

        <Section className="mb-8 overflow-hidden rounded-lg" style={{border: '1px solid #e5e7eb'}}>
          <Section className="bg-gray-50 px-6 py-4">
            <Text className="mb-0 mt-0 text-xs font-medium uppercase tracking-wider text-gray-500">
              Why verification might fail
            </Text>
          </Section>
          <Section className="px-6 py-6">
            <Section className="mb-3">
              <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-700">
                DNS records were removed or modified incorrectly
              </Text>
            </Section>
            <Section className="mb-3">
              <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-700">DNS propagation issues or delays</Text>
            </Section>
            <Section className="mb-3">
              <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-700">
                Domain ownership or registrar changed
              </Text>
            </Section>
          </Section>
        </Section>

        <Heading className="mb-4 mt-0 text-lg font-semibold text-gray-900">Steps to fix</Heading>

        <Section className="mb-8">
          <Section className="mb-3">
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Check your DNS records</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              Verify that all DKIM records are still in place and configured correctly
            </Text>
          </Section>

          <Section className="mb-3">
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Re-verify your domain</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              Trigger a verification check in your domain settings
            </Text>
          </Section>

          <Section>
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Update your templates</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              If needed, switch to a verified domain to continue sending emails
            </Text>
          </Section>
        </Section>

        <Section className="mb-6">
          <Link
            href={`${dashboardUrl}/settings?tab=domains`}
            className="inline-block rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white no-underline"
          >
            Fix domain verification
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

export default DomainUnverifiedEmail;
