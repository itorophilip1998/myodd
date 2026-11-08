import { SignIn } from '@clerk/nextjs';
import { clerkRuntimeConfig } from '@/lib/clerk-config';
import { AuthFlowAnalytics } from '@/components/AuthFlowAnalytics';
export default function AuthPage() {
  if (!clerkRuntimeConfig().configured) return <main className="workspace"><p>Clerk sign-in is not configured yet.</p></main>;
  return <main className="auth-page"><AuthFlowAnalytics /><SignIn path="/sign-in" routing="path" /></main>;
}
