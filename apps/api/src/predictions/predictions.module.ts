import { Module } from '@nestjs/common';
import { PREDICTION_ENGINE } from './prediction.engine';
import { OddsImpliedEngine } from './odds-implied.engine';
import { PredictionsService } from './predictions.service';

@Module({
  providers: [
    OddsImpliedEngine,
    PredictionsService,
    { provide: PREDICTION_ENGINE, useExisting: OddsImpliedEngine },
  ],
  exports: [PREDICTION_ENGINE, PredictionsService, OddsImpliedEngine],
})
export class PredictionsModule {}
