import { Module } from '@nestjs/common';
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
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MonthlyContract.name, schema: MonthlyContractSchema },
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: MonthlySettlement.name, schema: MonthlySettlementSchema },
      { name: HelperProfile.name, schema: HelperProfileSchema },
    ]),
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [MonthlyContractsController],
  providers: [MonthlyContractsService],
  exports: [MonthlyContractsService],
})
export class MonthlyContractsModule {}
