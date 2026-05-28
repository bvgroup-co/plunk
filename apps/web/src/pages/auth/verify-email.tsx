import {Button, Card, CardContent} from '@plunk/ui';
import {NextSeo} from 'next-seo';
import Image from 'next/image';
import Link from 'next/link';

const dotGrid = {
  backgroundColor: '#fafafa',
  backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
  backgroundSize: '20px 20px',
};

export default function VerifyEmail() {
  return (
    <>
      <NextSeo title="Verify Email" />
      <div className="min-h-screen flex items-center justify-center py-12" style={dotGrid}>
        <div className="flex flex-col gap-6 max-w-md w-full px-4">
          <div className="flex items-center justify-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-white shadow-sm border border-neutral-200 flex items-center justify-center p-1">
              <Image src="/assets/logo.svg" alt="" aria-hidden width={24} height={24} />
            </div>
            <span className="text-lg font-bold tracking-tight text-neutral-900">Plunk</span>
          </div>

          <Card>
            <CardContent className="p-8">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex flex-col gap-1.5">
                  <h1 className="text-xl font-bold tracking-tight">Email verification is managed by SSO</h1>
                  <p className="text-sm text-neutral-500">
                    This Plunk instance trusts verified emails from your organization identity provider.
                  </p>
                </div>
                <Button asChild className="mt-2">
                  <Link href="/auth/login">Back to login</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
