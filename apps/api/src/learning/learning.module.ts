import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { LearningController } from './learning.controller';
import { PerformanceController } from './performance.controller';
import { ModelLearningService } from './model-learning.service';
import { LEARNING_QUEUE, LearningSchedule, LearningProcessor } from './learning-maintenance';

@Module({
  imports: [AiModule, BullModule.registerQueue({ name: LEARNING_QUEUE })],
  controllers: [LearningController, PerformanceController],
  providers: [ModelLearningService, LearningSchedule, LearningProcessor],
})
export class LearningModule {}
