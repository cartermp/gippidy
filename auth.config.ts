import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  providers: [],
  callbacks: {
    signIn({ user }) {
      if (!process.env.ALLOWED_EMAIL || !user.email) return false;
      const allowed = process.env.ALLOWED_EMAIL.split(',').map(e => e.trim()).filter(Boolean);
      return allowed.includes(user.email);
    },
  },
};
