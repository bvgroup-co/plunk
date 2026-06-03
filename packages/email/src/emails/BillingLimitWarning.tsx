import {Heading, Link, Section, Text} from '@react-email/components';
import * as React from 'react';
import {EmailLayout} from '../common/EmailLayout';
import {Footer} from '../common/Footer';
import {Header} from '../common/Header';

interface BillingLimitWarningEmailProps {
  projectName: string;
  projectId: string;
  usage: number;
  limit: number;
  percentage: number;
  sourceType: string;
  dashboardUrl?: string;
}

export function BillingLimitWarningEmail({
  projectName = 'My Project',
  projectId = 'proj_example123',
  usage = 8500,
  limit = 10000,
  percentage = 85,
  sourceType = 'Transactional',
  dashboardUrl = 'https://next-app.useplunk.com',
}: BillingLimitWarningEmailProps) {
  const percentageRounded = Math.round(percentage);
  const remaining = limit - usage;

  return (
    <EmailLayout>
      <Header />

      <Section className="px-8 pb-10 pt-10">
        <Heading className="mb-2 mt-0 text-2xl font-semibold tracking-tight text-gray-900">Usage limit warning</Heading>

        <Text className="mb-8 mt-0 text-base leading-relaxed text-gray-600">
          Your project <strong className="font-medium text-gray-900">{projectName}</strong> has used{' '}
          <strong className="font-medium text-gray-900">{percentageRounded}%</strong> of your configured monthly billing
          limit.
        </Text>

        <Section className="mb-8 overflow-hidden rounded-lg" style={{border: '1px solid #e5e7eb'}}>
          <Section className="bg-gray-50 px-6 py-4">
            <Text className="mb-0 mt-0 text-xs font-medium uppercase tracking-wider text-gray-500">
              Usage this month
            </Text>
          </Section>
          <Section className="px-6 py-6">
            <Section className="mb-6">
              <Section className="mb-2 flex items-baseline justify-between">
                <Text className="mb-0 mt-0 text-sm text-gray-600">Emails sent</Text>
                <Text className="mb-0 mt-0 text-sm font-medium text-gray-900">
                  {usage.toLocaleString()} / {limit.toLocaleString()}
                </Text>
              </Section>
              <Section className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full bg-gray-900" style={{width: `${percentageRounded}%`, height: '100%'}} />
              </Section>
            </Section>
            <Text className="mb-0 mt-0 text-xs text-gray-500">{sourceType} emails</Text>
          </Section>
        </Section>

        <Section className="mb-8 rounded-lg bg-amber-50 px-6 py-4" style={{border: '1px solid #fbbf24'}}>
          <Text className="mb-0 mt-0 text-sm leading-relaxed text-amber-900">
            When you reach 100%, email sending will be paused to prevent charges beyond your configured limit. Your
            usage will reset at the start of next month.
          </Text>
        </Section>

        <Heading className="mb-4 mt-0 text-lg font-semibold text-gray-900">Recommended actions</Heading>

        <Section className="mb-8">
          <Section className="mb-3">
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Increase your billing limit</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              Adjust your monthly limit in billing settings to continue sending
            </Text>
          </Section>

          <Section className="mb-3">
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Monitor your usage</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              Track your sending patterns in the dashboard
            </Text>
          </Section>

          <Section>
            <Text className="mb-1 mt-0 text-sm font-medium text-gray-900">Optimize your sending</Text>
            <Text className="mb-0 mt-0 text-sm leading-relaxed text-gray-600">
              Review and reduce email volume where possible
            </Text>
          </Section>
        </Section>

        <Section className="mb-6">
          <Link
            href={`${dashboardUrl}/settings?tab=billing`}
            className="inline-block rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white no-underline"
          >
            Adjust billing limit
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

export default BillingLimitWarningEmail;
