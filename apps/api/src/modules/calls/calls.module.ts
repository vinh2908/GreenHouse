import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { StringeeProvider } from './stringee.provider';
import { CallProvider, CALL_PROVIDER } from './call-provider.interface';
import { CallSession, CallSessionSchema } from './schemas/call-session.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { ChatModule } from '../chat/chat.module';

/**
 * Chọn adapter theo env CALL_PROVIDER (mặc định 'stringee').
 * Thêm nhà cung cấp mới: implement CallProvider + thêm nhánh ở factory này.
 */
const callProviderFactory = {
  provide: CALL_PROVIDER,
  useFactory: (config: ConfigService): CallProvider => {
    const name = (config.get<string>('CALL_PROVIDER') || 'stringee').toLowerCase();
    switch (name) {
      case 'stringee':
      default:
        return new StringeeProvider(config);
    }
  },
  inject: [ConfigService],
};

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CallSession.name, schema: CallSessionSchema },
      { name: Job.name, schema: JobSchema },
    ]),
    ChatModule, // AppGateway — báo cuộc gọi đến qua socket
  ],
  controllers: [CallsController],
  providers: [CallsService, StringeeProvider, callProviderFactory],
  exports: [CallsService],
})
export class CallsModule {}
