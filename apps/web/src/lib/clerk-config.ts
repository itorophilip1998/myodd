import 'server-only';
/** Runtime lookup: Docker injects CLI-managed keys without baking secrets into images. */
export function clerkRuntimeConfig() {
  const publishableName = 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY';
  const secretName = 'CLERK_SECRET_KEY';
  return { publishableKey: process.env[publishableName], configured: !!process.env[publishableName] && !!process.env[secretName] };
}
