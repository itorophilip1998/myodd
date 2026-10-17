import { Module } from '@nestjs/common';
import { BookmakerModule } from '../bookmaker/bookmaker.module';
import { AiModule } from '../ai/ai.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { ExploreController } from './explore.controller';
import { ExploreService } from './explore.service';
@Module({ imports: [BookmakerModule, AiModule, PredictionsModule], controllers: [ExploreController], providers: [ExploreService] })
export class ExploreModule {}
