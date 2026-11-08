import { Module } from '@nestjs/common';
import { BOOKMAKER_PROVIDER } from './bookmaker.provider';
import { SportyBetClient } from './sportybet.client';
import { SportyBetProvider } from './sportybet.provider';
import { SportyBetSettlementService } from './sportybet.settlement';

@Module({
  providers: [
    SportyBetClient,
    SportyBetProvider,
    SportyBetSettlementService,
    { provide: BOOKMAKER_PROVIDER, useExisting: SportyBetProvider },
  ],
  exports: [BOOKMAKER_PROVIDER, SportyBetProvider, SportyBetClient, SportyBetSettlementService],
})
export class BookmakerModule {}
