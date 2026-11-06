import { Types } from 'mongoose';
import { JobsService } from './jobs.service';
import { JobStatus } from '@homemate/types';

/** Spec B59: chỉ nhận lời mời nhóm khi đơn còn đang hoạt động. */
describe('JobsService.respondTeamInvitation (B59)', () => {
  const helperId = new Types.ObjectId();

  function makeService(jobStatus: JobStatus) {
    const jobId = new Types.ObjectId();
    const jobRecord: Record<string, unknown> = {
      _id: jobId,
      customer_id: new Types.ObjectId(),
      helper_id: new Types.ObjectId(),
      status: jobStatus,
      title: 'Dọn nhà theo nhóm',
      team: [
        {
          helper_id: helperId,
          role: 'member',
          status: 'invited',
          split_percent: 30,
          invited_at: new Date(),
        },
      ],
      save: jest.fn(async function (this: Record<string, unknown>) {
        return this;
      }),
    };
    const jobModel: any = {
      findById: jest.fn(() => ({ exec: async () => jobRecord })),
    };
    const dummy = {} as never;
    const service = new JobsService(
      jobModel,
      dummy, // quoteModel
      dummy, // contractModel
      dummy, // serviceModel
      dummy, // helperModel
      dummy, // penaltyEventModel
      dummy, // userModel
      { emitToJob: jest.fn(), emitToUser: jest.fn() } as never, // gateway
      { create: jest.fn(async () => ({})) } as never, // notificationsService
      { addParticipantByJob: jest.fn(async () => undefined) } as never, // chatService
      dummy, // paymentsService
      dummy, // routingService
      dummy, // favoritesService
      dummy, // vouchersService
      dummy, // loyaltyService
      dummy, // disputesService
    );
    return { service, jobRecord, jobId };
  }

  it('đơn đã COMPLETED → chấp nhận lời mời nhóm → 400', async () => {
    const { service, jobId } = makeService(JobStatus.COMPLETED);
    await expect(
      service.respondTeamInvitation(String(jobId), String(helperId), 'accept'),
    ).rejects.toThrow('Đơn đã kết thúc hoặc đã hủy');
  });

  it('đơn đã CANCELLED → chấp nhận lời mời nhóm → 400', async () => {
    const { service, jobId } = makeService(JobStatus.CANCELLED);
    await expect(
      service.respondTeamInvitation(String(jobId), String(helperId), 'accept'),
    ).rejects.toThrow('Đơn đã kết thúc hoặc đã hủy');
  });

  it('đơn đang làm (IN_PROGRESS) → chấp nhận → thành công', async () => {
    const { service, jobRecord, jobId } = makeService(JobStatus.IN_PROGRESS);
    const result = await service.respondTeamInvitation(String(jobId), String(helperId), 'accept');
    expect((result.team as any[])[0].status).toBe('accepted');
    expect((jobRecord['team'] as any[])[0].status).toBe('accepted');
  });

  it('đơn đã COMPLETED → từ chối lời mời → vẫn được (dọn lời mời cũ)', async () => {
    const { service, jobRecord, jobId } = makeService(JobStatus.COMPLETED);
    const result = await service.respondTeamInvitation(String(jobId), String(helperId), 'decline');
    expect((result.team as any[])[0].status).toBe('declined');
    expect((jobRecord['team'] as any[])[0].status).toBe('declined');
  });
});
