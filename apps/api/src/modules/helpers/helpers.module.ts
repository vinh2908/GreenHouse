import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HelpersController } from './helpers.controller';
import { HelpersService } from './helpers.service';
import { HelperProfile, HelperProfileSchema } from './schemas/helper-profile.schema';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: HelperProfile.name, schema: HelperProfileSchema }]),
    ChatModule,
  ],
  controllers: [HelpersController],
  providers: [HelpersService],
  exports: [HelpersService],
})
export class HelpersModule {}
