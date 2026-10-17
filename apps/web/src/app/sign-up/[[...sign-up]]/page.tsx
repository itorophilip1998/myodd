import { SignUp } from '@clerk/nextjs';
import { clerkRuntimeConfig } from '@/lib/clerk-config';
export default function AuthPage() {
  if (!clerkRuntimeConfig().configured) return <main className="workspace"><p>Clerk sign-in is not configured yet.</p></main>;
  return <main className="auth-page"><SignUp path="/sign-up" routing="path" /></main>;
}
