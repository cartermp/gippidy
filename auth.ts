import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_ID!,
      clientSecret: process.env.GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    signIn({ user }) {
      const allowed = (process.env.ALLOWED_EMAIL ?? '').split(',').map(e => e.trim());
      return allowed.includes(user.email ?? '');
    },
  },
});
