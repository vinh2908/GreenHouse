import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MonthlyContractsService } from './monthly-contracts.service';

/** Spec B51: duyệt nghỉ phép chặn ngày đã chấm công. */
describe('MonthlyContractsService.respondLeave (B51)', () => {
  const customerId = new Types.ObjectId();
  const helperId = new Types.ObjectId();
  const contractId = new Types.ObjectId();

  function makeService(attendanceRecord: { status: string } | null) {
    const contract: any = {
      _id: contractId,
      customer_id: customerId,
      helper_id: helperId,
      title: 'Giúp việc theo tháng',
      status: 'active',
    };
    const contractModel: any = {
      findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(contract) }),
    };
    const leave: any = {
      _id: new Types.ObjectId(),
      contract_id: contractId,
      date: '2026-11-10',
      reason: 'Việc gia đình',
      status: 'pending',
      save: jest.fn(async function (this: any) {
        return this;
      }),
    };
    const leaveModel: any = {
      findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(leave) }),
    };
    const attendanceModel: any = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(attendanceRecord) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    const service = new MonthlyContractsService(
      contractModel,
      attendanceModel,
      leaveModel,
      {} as never,
      {} as never,
      {} as never,
      { create: jest.fn(async () => ({})) } as never,
      {} as never,
      { emitToUser: jest.fn() } as never,
    );
    return { service, leave };
  }

  it('thợ đã chấm công ngày 10/11 → duyệt nghỉ ngày đó → 400', async () => {
    const { service, leave } = makeService({ status: 'checked_in' });
    await expect(
      service.respondLeave(String(customerId), String(contractId), String(leave._id), true),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(leave.status).toBe('pending');
  });

  it('ngày chưa chấm công → duyệt nghỉ thành công', async () => {
    const { service, leave } = makeService(null);
    const result = await service.respondLeave(
      String(customerId),
      String(contractId),
      String(leave._id),
      true,
    );
    expect(result.status).toBe('approved');
  });
});
