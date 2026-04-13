import { googleAuthConfigured, signIn } from '@/auth';

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-box">
        <div className="logo login-logo">GIPPIDY</div>
        {googleAuthConfigured ? (
          <form action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/' });
          }}>
            <button type="submit">[SIGN IN WITH GOOGLE]</button>
          </form>
        ) : (
          <div className="login-note">
            Google OAuth is not configured.
          </div>
        )}
      </div>
    </div>
  );
}
