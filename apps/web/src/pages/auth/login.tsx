import {Button, Card, CardContent} from '@plunk/ui';
import {NextSeo} from 'next-seo';
import Image from 'next/image';
import {useRouter} from 'next/router';

import {API_URI} from '../../lib/constants';
import {useConfig} from '../../lib/hooks/useConfig';

const dotGrid = {
  backgroundColor: '#fafafa',
  backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
  backgroundSize: '20px 20px',
};

export default function Login() {
  const router = useRouter();
  const {data: config} = useConfig();
  const displayName = config?.features.authProviders.oidcDisplayName ?? 'Single Sign-On';
  const message = typeof router.query.message === 'string' ? router.query.message : null;

  return (
    <>
      <NextSeo title="Log in" />
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
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1.5 text-center">
                  <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
                  <p className="text-sm text-neutral-500">Sign in with your organization account</p>
                </div>

                {message && <p className="text-sm text-red-500 text-center">{message}</p>}

                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    window.location.href = `${API_URI}/oauth/oidc/outbound`;
                  }}
                >
                  Continue with {displayName}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
