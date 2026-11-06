import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HelpersController } from './helpers.controller';
import { HelpersService } from './helpers.service';
import { HelperProfile, HelperProfileSchema } from './schemas/helper-profile.schema';
import { ChatModule } from '../chat/chat.module';
import { MatchingModule } from '../matching/matching.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: HelperProfile.name, schema: HelperProfileSchema }]),
    ChatModule,
    MatchingModule,
  ],
  controllers: [HelpersController],
  providers: [HelpersService],
  exports: [HelpersService],
})
export class HelpersModule {}
