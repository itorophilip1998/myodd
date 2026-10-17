import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { ClerkGuard, type AuthRequest } from '../auth/auth.guard';
import { canAccessGroup } from '../groups/group-access';
import { PrismaService } from '../prisma/prisma.service';

@Controller('jobs')
@UseGuards(ClerkGuard)
export class JobsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':jobId')
  async getJob(@Param('jobId') jobId: string, @Req() req: AuthRequest) {
    const job = await this.prisma.generationJob.findUnique({
      where: { id: jobId },
      include: { group: true },
    });
    if (!job || !job.group || !canAccessGroup(job.group, req.account?.id)) throw new NotFoundException('Job not found');
    return {
      id: job.id,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      status: job.status,
      stage: job.stage,
      stageDetail: job.stageDetail,
      progress: job.progress,
      total: job.total,
      groupId: job.groupId,
      publicId: job.group?.publicId ?? null,
      error: job.error,
      failedCount: job.failedCount,
    };
  }
}
