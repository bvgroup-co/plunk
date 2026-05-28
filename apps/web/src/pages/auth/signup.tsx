import {zodResolver} from '@hookform/resolvers/zod';
import {AuthenticationSchemas} from '@plunk/shared';
import {
  Button,
  Card,
  CardContent,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  IconSpinner,
  Input,
} from '@plunk/ui';
import {AnimatePresence, motion} from 'framer-motion';
import {NextSeo} from 'next-seo';
import Image from 'next/image';
import Link from 'next/link';
import {useRouter} from 'next/router';
import React, {useState} from 'react';
import {useForm} from 'react-hook-form';
import type {z} from 'zod';

import {useConfig} from '../../lib/hooks/useConfig';
import {useProjects} from '../../lib/hooks/useProject';
import {useUser} from '../../lib/hooks/useUser';
import {network} from '../../lib/network';


export default function Signup() {
  const {mutate: userMutate} = useUser();
  const {mutate: projectsMutate} = useProjects();
  const router = useRouter();

  const form = useForm<z.infer<typeof AuthenticationSchemas.signup>>({
    resolver: zodResolver(AuthenticationSchemas.signup),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {data: config} = useConfig();
  const authConfig = config?.features.auth;
  const passwordEnabled = authConfig?.password.enabled ?? true;
  const signupEnabled = authConfig?.password.signupEnabled ?? true;

  async function onSubmit(values: z.infer<typeof AuthenticationSchemas.signup>) {
    try {
      const response = await network.fetch<
        {
          success: boolean;
          data: {id: string; email: string} | string;
        },
        typeof AuthenticationSchemas.signup
      >('POST', '/auth/signup', values);

      if (!response.success) {
        const errorData = typeof response.data === 'string' ? response.data : 'Something went wrong';
        setErrorMessage(errorData);
      } else {
        setErrorMessage(null);

        await userMutate();
        await projectsMutate();

        await router.push('/projects/create');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Something went wrong');
    }
  }

  if (!passwordEnabled) {
    return (
      <AuthUnavailable title="Sign up is disabled" message="This Plunk instance does not use password authentication." />
    );
  }

  if (!signupEnabled) {
    return <AuthUnavailable title="Sign up is disabled" message="New password account signups are disabled." />;
  }

  return (
    <>
      <NextSeo title="Sign Up" />
      <div
        className="min-h-screen flex items-center justify-center py-12"
        style={{
          backgroundColor: '#fafafa',
          backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        <div className="flex flex-col gap-6 max-w-md w-full px-4">
          <div className="flex items-center justify-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-white shadow-sm border border-neutral-200 flex items-center justify-center p-1">
              <Image src="/assets/logo.svg" alt="" aria-hidden width={24} height={24} />
            </div>
            <span className="text-lg font-bold tracking-tight text-neutral-900">Plunk</span>
          </div>

          <Card>
            <CardContent className="p-0">
              <Form {...form}>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    void form.handleSubmit(onSubmit)(e);
                  }}
                  className="p-8"
                >
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-1.5">
                      <h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
                      <p className="text-sm text-neutral-500">Start sending emails in minutes</p>
                    </div>

                    <div className="grid gap-4">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({field}) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="you@example.com" autoFocus {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="password"
                        render={({field}) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input placeholder="At least 6 characters" type="password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <AnimatePresence>
                      {errorMessage && (
                        <motion.p
                          initial={{opacity: 0, y: -8}}
                          animate={{opacity: 1, y: 0}}
                          exit={{opacity: 0, y: -8}}
                          transition={{duration: 0.15}}
                          className="text-sm text-red-500"
                        >
                          {errorMessage}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? (
                        <>
                          <IconSpinner size="sm" />
                          Creating account...
                        </>
                      ) : (
                        'Create account'
                      )}
                    </Button>

                    <p className="text-center text-sm text-neutral-500">
                      Already have an account?{' '}
                      <Link href="/auth/login" className="text-neutral-900 underline underline-offset-4 hover:text-neutral-600 transition-colors">
                        Log in
                      </Link>
                    </p>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function AuthUnavailable({title, message}: {title: string; message: string}) {
  return (
    <>
      <NextSeo title={title} />
      <div
        className="min-h-screen flex items-center justify-center py-12"
        style={{
          backgroundColor: '#fafafa',
          backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
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
                  <h1 className="text-xl font-bold tracking-tight">{title}</h1>
                  <p className="text-sm text-neutral-500">{message}</p>
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
