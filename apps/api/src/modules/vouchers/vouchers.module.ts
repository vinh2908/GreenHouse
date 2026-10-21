import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VouchersController, AdminVouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';
import {
  Voucher,
  VoucherSchema,
  VoucherRedemption,
  VoucherRedemptionSchema,
} from './schemas/voucher.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Voucher.name, schema: VoucherSchema },
      { name: VoucherRedemption.name, schema: VoucherRedemptionSchema },
      { name: Job.name, schema: JobSchema },
    ]),
  ],
  controllers: [VouchersController, AdminVouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}
