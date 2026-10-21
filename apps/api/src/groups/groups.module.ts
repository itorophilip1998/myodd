import { BullModule } from '@nestjs/bullmq';
import { SETTLEMENT_QUEUE, SettlementSchedule, SettlementProcessor } from './settlement-maintenance';
import { CatalogModule } from '../catalog/catalog.module';
import { BookmakerModule } from '../bookmaker/bookmaker.module';
import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { PlayCheckService } from './play-check.service';
import { FootballResultsService } from './football-results.service';

@Module({
  imports: [CatalogModule, BookmakerModule, BullModule.registerQueue({ name: SETTLEMENT_QUEUE })],
  controllers: [GroupsController],
  providers: [GroupsService, PlayCheckService, FootballResultsService, SettlementSchedule, SettlementProcessor],
  exports: [GroupsService, PlayCheckService],
})
export class GroupsModule {}
