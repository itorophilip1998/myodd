import { Module } from '@nestjs/common';
import { BOOKMAKER_PROVIDER } from './bookmaker.provider';
import { SportyBetClient } from './sportybet.client';
import { SportyBetProvider } from './sportybet.provider';

@Module({
  providers: [
    SportyBetClient,
    SportyBetProvider,
    { provide: BOOKMAKER_PROVIDER, useExisting: SportyBetProvider },
  ],
  exports: [BOOKMAKER_PROVIDER, SportyBetProvider, SportyBetClient],
})
export class BookmakerModule {}
