import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import { authConfig } from './auth.config';
import { getUser, createUserWithEmail } from '@/lib/db/queries';
import { createBusinessSpan, recordError } from '@/lib/telemetry';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Google({
      // biome-ignore lint/style/noNonNullAssertion: Required environment variables
      clientId: process.env.GOOGLE_ID!,
      // biome-ignore lint/style/noNonNullAssertion: Required environment variables
      clientSecret: process.env.GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const authSpan = createBusinessSpan('auth.SignIn');

      const allowedEmail = process.env.ALLOWED_EMAIL?.trim();
      const userEmail = user.email?.trim();

      authSpan.setAttributes({
        'auth.provider': 'google',
        'auth.user_email': userEmail || 'unknown',
        'auth.email_allowed': allowedEmail === userEmail,
      });

      if (allowedEmail !== userEmail) {
        authSpan.setAttribute('auth.email_rejected', true);
        authSpan.end();
        return false;
      }

      // Create or get user in our database
      try {
        const dbUsers = await getUser(userEmail || '');
        const isNewUser = dbUsers.length === 0;

        authSpan.setAttributes({
          'auth.is_new_user': isNewUser,
        });

        if (isNewUser) {
          // Create new user
          const [newUser] = await createUserWithEmail(userEmail || '');
          user.id = newUser.id;

          authSpan.setAttributes({
            'auth.user_created': true,
            'app.user.id': newUser.id,
            'app.user.email': newUser.email,
          });
        } else {
          // Use existing user
          user.id = dbUsers[0].id;

          authSpan.setAttributes({
            'auth.user_signin': true,
            'app.user.id': user.id,
            'app.user.email': userEmail,
          });
        }

        authSpan.end();
        return true;
      } catch (error) {
        recordError(authSpan, error as Error, {
          'error.context': 'user_creation_or_lookup',
        });
        authSpan.end();
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
        const sessionSpan = createBusinessSpan('auth.Session');

        session.user.id = token.id as string;
        
        sessionSpan.setAttributes({
          'auth.user_email': session.user.email || 'unknown',
          'auth.token_id': token.id as string,
        });

        // Ensure user exists in database (in case they were deleted or JWT persisted after failed creation)
        try {
          const dbUsers = await getUser(session.user.email || '');
          if (dbUsers.length === 0) {
            const [newUser] = await createUserWithEmail(session.user.email || '');
            session.user.id = newUser.id;

            sessionSpan.setAttributes({
              'app.user.id': newUser.id,
              'app.user.email': session.user.email,
              'app.session.context': 'session_callback',
            })
          } else {
            // Make sure we're using the correct database ID
            session.user.id = dbUsers[0].id;
          }

          sessionSpan.end();
        } catch (error) {
          recordError(sessionSpan, error as Error, {
            'error.context': 'session_user_verification',
          });
          sessionSpan.end();
          console.error('Error ensuring user exists during session:', error);
        }
      }
      return session;
    },
  },
});
