import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ClerkGuard, SignedInGuard } from './auth.guard';
import { AccountController } from './account.controller';
@Global()
@Module({ providers: [AuthService, ClerkGuard, SignedInGuard], controllers: [AccountController], exports: [AuthService, ClerkGuard, SignedInGuard] })
export class AuthModule {}
