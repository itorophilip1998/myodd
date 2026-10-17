import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AppUser } from '@prisma/client';
import { AuthService } from './auth.service';
export type AuthRequest = Request & { account?: AppUser };
@Injectable()
export class ClerkGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    req.account = await this.auth.authenticate(req.headers.authorization);
    return true;
  }
}
@Injectable()
export class SignedInGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (!context.switchToHttp().getRequest<AuthRequest>().account) throw new UnauthorizedException('Sign in to access your saved collections.');
    return true;
  }
}
