import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { authConfig } from './auth.config';

const googleId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_ID;
const googleSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_SECRET;
export const googleAuthConfigured = Boolean(googleId && googleSecret);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: googleAuthConfigured
    ? [
        Google({
          clientId: googleId!,
          clientSecret: googleSecret!,
        }),
      ]
    : [],
});
