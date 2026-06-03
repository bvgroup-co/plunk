import {Heading, Link, Section, Text} from '@react-email/components';
import * as React from 'react';
import {EmailLayout} from '../common/EmailLayout';
import {Footer} from '../common/Footer';
import {Header} from '../common/Header';

interface ProjectDisabledEmailProps {
  projectName: string;
  projectId: string;
  violations: string[];
  dashboardUrl?: string;
}

export function ProjectDisabledEmail({
  projectName = 'My Project',
  projectId = 'proj_example123',
  violations: _violations = [],
  dashboardUrl = 'https://next-app.useplunk.com',
}: ProjectDisabledEmailProps) {
  return (
    <EmailLayout>
      <Header />

      <Section className="px-8 pb-10 pt-10">
        <Heading className="mb-2 mt-0 text-2xl font-semibold tracking-tight text-gray-900">Project disabled</Heading>

        <Text className="mb-8 mt-0 text-base leading-relaxed text-gray-600">
          Your project <strong className="font-medium text-gray-900">{projectName}</strong> has been disabled. All
          scheduled campaigns and workflows have been cancelled.
        </Text>

        <Section className="mb-8 rounded-lg bg-red-50 px-6 py-4" style={{border: '1px solid #fca5a5'}}>
          <Text className="mb-0 mt-0 text-sm leading-relaxed text-red-900">
            Your project has been flagged during a routine review and disabled to protect your account and our platform.
            Please contact our support team for more details and to resolve this issue.
          </Text>
        </Section>

        <Heading className="mb-4 mt-0 text-lg font-semibold text-gray-900">Next steps</Heading>

        <Section className="mb-8">
          <Section className="mb-3">
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Contact support</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              Reach out to our support team to understand the reason for the suspension and how to resolve it
            </Text>
          </Section>

          <Section className="mb-3">
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Review your account</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              While you wait, review your sending practices and ensure they comply with our terms of service
            </Text>
          </Section>
        </Section>

        <Section className="mb-6">
          <Link
            href={dashboardUrl}
            className="inline-block rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white no-underline"
          >
            View project dashboard
          </Link>
        </Section>
      </Section>

      <Footer projectId={projectId} />
    </EmailLayout>
  );
}

export default ProjectDisabledEmail;
