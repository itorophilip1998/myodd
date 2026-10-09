import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { BookmakerModule } from './bookmaker/bookmaker.module';
import { BookingsModule } from './bookings/bookings.module';
import { PredictionsModule } from './predictions/predictions.module';
import { AiModule } from './ai/ai.module';
import { SlipsModule } from './slips/slips.module';
import { GroupsModule } from './groups/groups.module';
import { JobsModule } from './jobs/jobs.module';
import { CommonModule } from './common/common.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    }),
    PrismaModule,
    RedisModule,
    CommonModule,
    BookmakerModule,
    BookingsModule,
    PredictionsModule,
    AiModule,
    SlipsModule,
    GroupsModule,
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
