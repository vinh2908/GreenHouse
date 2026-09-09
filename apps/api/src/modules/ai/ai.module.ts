import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiConfigService } from './services/ai-config.service';
import { AiBookingService } from './services/ai-booking.service';
import { AiMatchingService } from './services/ai-matching.service';
import { AiSupportService } from './services/ai-support.service';

@Module({
  controllers: [AiController],
  providers: [
    AiConfigService,
    AiBookingService,
    AiMatchingService,
    AiSupportService,
  ],
  exports: [
    AiConfigService,
    AiBookingService,
    AiMatchingService,
    AiSupportService,
  ],
})
export class AiModule {}
