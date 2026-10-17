import { CreatorsModule } from './creators/creators.module';
import { AuthModule } from './auth/auth.module';
import { ExploreModule } from './explore/explore.module';
import { LearningModule } from './learning/learning.module';
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
    CreatorsModule,
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    BullModule.forRoot({
      connection: {
        host: new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').hostname,
        port: Number(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port || 6379),
        password: new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').password || undefined,
      },
    }),
    PrismaModule,
    RedisModule,
    CommonModule,
    AuthModule,
    LearningModule,
    ExploreModule,
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
