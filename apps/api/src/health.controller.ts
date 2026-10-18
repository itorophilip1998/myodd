import { Controller, Get } from '@nestjs/common';
import { APP_VERSION, formatAppVersion } from '@myodd/shared';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    const gitSha = process.env.APP_GIT_SHA ?? process.env.NEXT_PUBLIC_APP_GIT_SHA ?? null;
    return {
      ok: true,
      service: 'myodd-api',
      version: APP_VERSION,
      gitSha: gitSha?.slice(0, 7) || null,
      label: formatAppVersion(gitSha),
    };
  }
}
