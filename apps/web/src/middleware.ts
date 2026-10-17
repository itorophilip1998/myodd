import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const publishableName = 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY';
  const secretName = 'CLERK_SECRET_KEY';
  const publishableKey = process.env[publishableName]; const secretKey = process.env[secretName];
  if (!publishableKey || !secretKey) return NextResponse.next();
  // The SDK reads CLERK_SECRET_KEY directly at runtime. Passing it as a dynamic
  // option would require encrypted propagation to downstream Next.js handlers.
  return clerkMiddleware({ publishableKey })(req, event);
}
export const config = { matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'] };
