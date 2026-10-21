import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';
import { clerkRuntimeConfig } from '@/lib/clerk-config';

export default function AuthPage() {
  if (!clerkRuntimeConfig().configured) {
    return <main className="workspace"><p>Clerk sign-in is not configured yet.</p></main>;
  }
  return (
    <main className="auth-page">
      <div className="auth-stack">
        <SignUp path="/sign-up" routing="path" />
        <p className="auth-legal">
          By creating an account, you agree to our{' '}
          <Link href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
