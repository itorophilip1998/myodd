import { CatalogModule } from '../catalog/catalog.module';
import { BookmakerModule } from '../bookmaker/bookmaker.module';
import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { PlayCheckService } from './play-check.service';

@Module({
  imports: [CatalogModule, BookmakerModule],
  controllers: [GroupsController],
  providers: [GroupsService, PlayCheckService],
  exports: [GroupsService, PlayCheckService],
})
export class GroupsModule {}
