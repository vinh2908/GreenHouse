import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HelpersController } from './helpers.controller';
import { HelpersService } from './helpers.service';
import { HelperProfile, HelperProfileSchema } from './schemas/helper-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: HelperProfile.name, schema: HelperProfileSchema }]),
  ],
  controllers: [HelpersController],
  providers: [HelpersService],
  exports: [HelpersService],
})
export class HelpersModule {}
