import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { authConfig } from './auth.config';
import { getUser, createUserWithEmail } from '@/lib/db/queries';
import { recordErrorOnCurrentSpan } from '@/lib/telemetry';
import { isTestEnvironment } from '@/lib/constants';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

const previewLoginEnabled = process.env.ENABLE_PREVIEW_LOGIN === 'true';

const nextAuth = NextAuth({
  ...authConfig,
  providers: [
    ...(previewLoginEnabled
      ? []
      : [
          Google({
            // biome-ignore lint/style/noNonNullAssertion: Required environment variables
            clientId: process.env.GOOGLE_ID!,
            // biome-ignore lint/style/noNonNullAssertion: Required environment variables
            clientSecret: process.env.GOOGLE_SECRET!,
          }),
        ]),
    ...(previewLoginEnabled
      ? [
          Credentials({
            name: 'Preview access',
            credentials: {
              code: { label: 'Access code', type: 'password' },
            },
            async authorize(credentials) {
              const previewCode = process.env.PREVIEW_LOGIN_CODE?.trim();
              const previewEmail = process.env.PREVIEW_LOGIN_EMAIL?.trim();
              const providedCode =
                typeof credentials?.code === 'string'
                  ? credentials.code.trim()
                  : undefined;

              if (!previewCode || !previewEmail) {
                return null;
              }

              if (providedCode !== previewCode) {
                return null;
              }

              const dbUsers = await getUser(previewEmail);
              let userId = dbUsers[0]?.id;

              if (!userId) {
                const [newUser] = await createUserWithEmail(previewEmail);
                userId = newUser.id;
              }

              return {
                id: userId,
                email: previewEmail,
                name: 'Preview User',
              };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      const allowedEmail = process.env.ALLOWED_EMAIL?.trim();
      const userEmail = user.email?.trim();

      if (account?.provider === 'google' && allowedEmail !== userEmail) {
        return false;
      }

      // Create or get user in our database
      try {
        const dbUsers = await getUser(userEmail || '');
        if (dbUsers.length === 0) {
          // Create new user
          const [newUser] = await createUserWithEmail(userEmail || '');
          user.id = newUser.id;
        } else {
          // Use existing user
          user.id = dbUsers[0].id;
        }
        return true;
      } catch (error) {
        recordErrorOnCurrentSpan(error as Error, {
          'error.context': 'auth_user_creation_or_lookup',
          'auth.user_email': userEmail,
          'auth.provider': 'google',
        });
        console.error('Error creating/getting user:', error);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;

        // Ensure user exists in database (in case they were deleted or JWT persisted after failed creation)
        try {
          const dbUsers = await getUser(session.user.email || '');
          if (dbUsers.length === 0) {
            const [newUser] = await createUserWithEmail(
              session.user.email || '',
            );
            session.user.id = newUser.id;
          } else {
            // Make sure we're using the correct database ID
            session.user.id = dbUsers[0].id;
          }
        } catch (error) {
          recordErrorOnCurrentSpan(error as Error, {
            'error.context': 'auth_session_user_verification',
            'auth.user_email': session.user.email,
          });
          console.error('Error ensuring user exists during session:', error);
        }
      }
      return session;
    },
  },
});

export const {
  handlers: { GET, POST },
  signIn,
  signOut,
} = nextAuth;

// Test auth override for integration tests
export async function auth() {
  if (isTestEnvironment) {
    // In test mode, extract user info from request headers
    const { headers } = await import('next/headers');
    const headerStore = await headers();
    const userAgent = headerStore.get('user-agent') || '';
    const testUserId = headerStore.get('x-test-user-id') || '';
    const testUserEmail = headerStore.get('x-test-user-email') || '';

    // Check if this is a Playwright test request
    if (userAgent.includes('Playwright') && testUserEmail) {
      // Ensure test user exists in database
      try {
        const dbUsers = await getUser(testUserEmail);
        let userId = testUserId;

        if (dbUsers.length === 0) {
          const [newUser] = await createUserWithEmail(testUserEmail);
          userId = newUser.id;
        } else {
          userId = dbUsers[0].id;
        }

        return {
          user: {
            id: userId,
            email: testUserEmail,
            name: `Test User ${testUserId}`,
          },
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        };
      } catch (error) {
        console.error('Error creating test user:', error);
        return null;
      }
    }
  }

  // In production/development, use normal NextAuth
  return nextAuth.auth();
}
