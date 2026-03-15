import { signIn } from '@/auth';

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-box">
        <div className="logo" style={{ fontSize: '20px', marginBottom: '24px' }}>GIPPIDY</div>
        <form action={async () => {
          'use server';
          await signIn('google', { redirectTo: '/' });
        }}>
          <button type="submit">[SIGN IN WITH GOOGLE]</button>
        </form>
      </div>
    </div>
  );
}
