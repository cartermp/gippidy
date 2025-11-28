'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { CatButtholeIcon } from '@/components/cat-butthole-icon';

export default function Page() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [accessCode, setAccessCode] = useState('');
  const [previewError, setPreviewError] = useState('');
  const previewLoginEnabled =
    process.env.NEXT_PUBLIC_ENABLE_PREVIEW_LOGIN === 'true';

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl: '/' });
  };

  const handlePreviewLogin = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setPreviewError('');
    startTransition(async () => {
      const result = await signIn('credentials', {
        code: accessCode,
        redirect: false,
      });

      if (result?.error) {
        setPreviewError('Invalid preview access code.');
        return;
      }

      router.push('/');
    });
  };

  return (
    <div className="flex h-dvh w-screen bg-background">
      {/* Left side - Welcome content */}
      <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-20 xl:px-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-md"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <CatButtholeIcon size={32} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Chat Gippidy</h1>
          </div>

          <h2 className="text-3xl font-bold tracking-tight text-foreground mb-4">
            Welcome back!
          </h2>

          <p className="text-lg text-muted-foreground mb-8">
            Your AI assistant is ready to help with coding, writing, analysis,
            and creative projects. Sign in to continue your conversations.
          </p>

          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="size-2 rounded-full bg-green-500" />
              <span>Interactive code execution</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="size-2 rounded-full bg-blue-500" />
              <span>Document creation and editing</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="size-2 rounded-full bg-purple-500" />
              <span>Real-time collaboration</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right side - Sign in form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-20 xl:px-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto w-full max-w-sm"
        >
          {/* Mobile header */}
          <div className="lg:hidden mb-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <CatButtholeIcon size={24} />
              </div>
              <h1 className="text-xl font-bold tracking-tight">Chat Gippidy</h1>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome back!
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to continue your AI conversations
            </p>
          </div>

          <div className="space-y-6">
            <div className="hidden lg:block">
              <h3 className="text-xl font-semibold text-foreground">
                {previewLoginEnabled
                  ? 'Preview access only'
                  : 'Sign in to your account'}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {previewLoginEnabled
                  ? 'Use your preview access code to sign in on this deployment.'
                  : 'Continue with your Google account to access Chat Gippidy'}
              </p>
            </div>

            {previewLoginEnabled ? (
              <form
                className="space-y-3 rounded-xl border border-border p-4"
                onSubmit={handlePreviewLogin}
              >
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Preview access
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    This preview build uses access codes instead of Google
                    sign-in.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Access code
                  </label>
                  <input
                    type="password"
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Enter code"
                    autoComplete="off"
                  />
                  {previewError ? (
                    <p className="text-xs text-destructive">{previewError}</p>
                  ) : null}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="sm"
                  disabled={isPending}
                >
                  {isPending ? 'Signing in…' : 'Sign in with preview code'}
                </Button>
              </form>
            ) : (
              <Button
                onClick={handleGoogleSignIn}
                className="w-full h-12 text-base font-medium"
                variant="outline"
                size="lg"
              >
                <svg className="mr-2 size-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </Button>
            )}

            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                By signing in, you agree to our terms of service and privacy
                policy.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
