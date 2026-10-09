import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':jobId')
  async getJob(@Param('jobId') jobId: string) {
    const job = await this.prisma.generationJob.findUnique({
      where: { id: jobId },
      include: { group: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      total: job.total,
      groupId: job.groupId,
      publicId: job.group?.publicId ?? null,
      error: job.error,
    };
  }
}
