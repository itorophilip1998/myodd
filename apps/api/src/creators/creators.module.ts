import { Module } from '@nestjs/common';
import { CreatorsService } from './creators.service';
import { CreatorsController } from './creators.controller';
@Module({ providers: [CreatorsService], controllers: [CreatorsController] })
export class CreatorsModule {}
