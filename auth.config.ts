import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  providers: [],
  callbacks: {
    signIn({ user }) {
      const allowed = (process.env.ALLOWED_EMAIL ?? '').split(',').map(e => e.trim());
      return allowed.includes(user.email ?? '');
    },
  },
};
