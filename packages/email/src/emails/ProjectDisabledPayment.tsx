import {Heading, Link, Section, Text} from '@react-email/components';
import * as React from 'react';
import {EmailLayout} from '../common/EmailLayout';
import {Footer} from '../common/Footer';
import {Header} from '../common/Header';

interface ProjectDisabledPaymentEmailProps {
  projectName: string;
  projectId: string;
  dashboardUrl?: string;
}

export function ProjectDisabledPaymentEmail({
  projectName = 'My Project',
  projectId = 'proj_example123',
  dashboardUrl = 'https://next-app.useplunk.com',
}: ProjectDisabledPaymentEmailProps) {
  return (
    <EmailLayout>
      <Header />

      <Section className="px-8 pb-10 pt-10">
        <Heading className="mb-2 mt-0 text-2xl font-semibold tracking-tight text-gray-900">Project disabled</Heading>

        <Text className="mb-8 mt-0 text-base leading-relaxed text-gray-600">
          Your project <strong className="font-medium text-gray-900">{projectName}</strong> has been automatically
          disabled because a recurring payment could not be processed.
        </Text>

        <Section className="mb-8 rounded-lg bg-red-50 px-6 py-4" style={{border: '1px solid #fca5a5'}}>
          <Text className="mb-0 mt-0 text-sm leading-relaxed text-red-900">
            All email sending is currently blocked. Please update your payment method to re-enable the project.
          </Text>
        </Section>

        <Heading className="mb-4 mt-0 text-lg font-semibold text-gray-900">How to restore your project</Heading>

        <Section className="mb-8">
          <Section className="mb-3">
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Update your payment method</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              Go to your billing settings and add a valid payment method
            </Text>
          </Section>

          <Section className="mb-3">
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Re-enable your project</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              Once your payment is resolved, contact support to re-enable your project
            </Text>
          </Section>

          <Section>
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Contact support</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              Need help? Our team is available to assist you
            </Text>
          </Section>
        </Section>

        <Section className="mb-6">
          <Link
            href={`${dashboardUrl}/settings?tab=billing`}
            className="inline-block rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white no-underline"
          >
            Update payment method
          </Link>
        </Section>
      </Section>

      <Footer projectId={projectId} />
    </EmailLayout>
  );
}

export default ProjectDisabledPaymentEmail;
