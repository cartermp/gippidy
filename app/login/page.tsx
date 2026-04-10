import { googleAuthConfigured, signIn } from '@/auth';

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-box">
        <div className="logo" style={{ fontSize: '20px', marginBottom: '24px' }}>GIPPIDY</div>
        {googleAuthConfigured ? (
          <form action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/' });
          }}>
            <button type="submit">[SIGN IN WITH GOOGLE]</button>
          </form>
        ) : (
          <div style={{ color: '#555', fontSize: '12px', textAlign: 'center' }}>
            Google OAuth is not configured.
          </div>
        )}
      </div>
    </div>
  );
}
