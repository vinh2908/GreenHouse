import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiConfigService } from './services/ai-config.service';
import { AiBookingService } from './services/ai-booking.service';
import { AiSupportService } from './services/ai-support.service';

@Module({
  controllers: [AiController],
  providers: [AiConfigService, AiBookingService, AiSupportService],
  exports: [AiConfigService, AiBookingService, AiSupportService],
})
export class AiModule {}
