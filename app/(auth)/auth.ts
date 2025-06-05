import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import { authConfig } from './auth.config';
import { getUser, createUserWithEmail } from '@/lib/db/queries';
import { recordErrorOnCurrentSpan } from '@/lib/telemetry';

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
      const allowedEmail = process.env.ALLOWED_EMAIL?.trim();
      const userEmail = user.email?.trim();

      if (allowedEmail !== userEmail) {
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
            const [newUser] = await createUserWithEmail(session.user.email || '');
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
