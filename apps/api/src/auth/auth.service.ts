import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}
  async authenticate(header?: string) {
    if (!header) return undefined;
    if (!/^Bearer \S+$/i.test(header)) throw new UnauthorizedException('Invalid session');
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new UnauthorizedException('Clerk sign-in is not configured');
    const origins = (process.env.CLERK_AUTHORIZED_PARTIES ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',').map(s => s.trim()).filter(Boolean);
    let clerkId: string;
    try {
      const client = createClerkClient({ secretKey, publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY });
      const state = await client.authenticateRequest(new Request('http://myodd-api.local/api', { headers: { authorization: header } }), { authorizedParties: origins, acceptsToken: 'session_token' });
      const auth = state.toAuth();
      if (!state.isAuthenticated || !auth?.userId) throw new Error('Signed out');
      clerkId = auth.userId;
    } catch { throw new UnauthorizedException('Your session is invalid or expired. Please sign in again.'); }
    // Identity comes only from the verified session, never a user ID supplied in JSON.
    return this.prisma.appUser.upsert({ where: { clerkId }, create: { clerkId }, update: { lastSeenAt: new Date() } });
  }
}
