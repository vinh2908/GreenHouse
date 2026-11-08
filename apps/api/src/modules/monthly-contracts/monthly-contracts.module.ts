import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MonthlyContractsController } from './monthly-contracts.controller';
import { MonthlyContractsService } from './monthly-contracts.service';
import {
  MonthlyContract,
  MonthlyContractSchema,
  AttendanceRecord,
  AttendanceRecordSchema,
  LeaveRequest,
  LeaveRequestSchema,
  MonthlySettlement,
  MonthlySettlementSchema,
} from './schemas/monthly-contract.schema';
import { HelperProfile, HelperProfileSchema } from '../helpers/schemas/helper-profile.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MonthlyContract.name, schema: MonthlyContractSchema },
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: MonthlySettlement.name, schema: MonthlySettlementSchema },
      { name: HelperProfile.name, schema: HelperProfileSchema },
      { name: Service.name, schema: ServiceSchema },
    ]),
    NotificationsModule,
    PaymentsModule,
    forwardRef(() => ChatModule),
  ],
  controllers: [MonthlyContractsController],
  providers: [MonthlyContractsService],
  exports: [MonthlyContractsService],
})
export class MonthlyContractsModule {}
