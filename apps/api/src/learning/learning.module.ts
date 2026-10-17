import { Module } from '@nestjs/common';
import { LearningController } from './learning.controller';
@Module({ controllers: [LearningController] })
export class LearningModule {}
