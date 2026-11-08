import { Types } from 'mongoose';
import { CallsService } from './calls.service';

describe('H21: Race-safe Call Session Creation', () => {
  it('2 concurrent calls to the same job -> only 1 session created, partner/callee correct for both sides', async () => {
    const customerId = new Types.ObjectId();
    const helperId = new Types.ObjectId();
    const jobId = new Types.ObjectId();

    const job = {
      _id: jobId,
      status: 'in_progress',
      customer_id: customerId,
      helper_id: helperId,
      team: [],
    };

    const jobModel: any = {
      findById: jest.fn(() => ({ exec: async () => job })),
    };

    const sessionsInDb: any[] = [];
    let createCallCount = 0;

    const callSessionModel: any = {
      findOne: jest.fn((query: any) => ({
        sort: () => ({
          exec: async () => {
            if (query.job_id && sessionsInDb.length > 0) {
              return sessionsInDb[0];
            }
            return null;
          },
        }),
      })),
      create: jest.fn(async (doc: any) => {
        createCallCount++;
        // Simulate race condition: first caller creates successfully,
        // second concurrent caller gets E11000 duplicate key error
        if (sessionsInDb.length > 0) {
          const err: any = new Error('E11000 duplicate key error collection: call_sessions index: job_id_1 dup key');
          err.code = 11000;
          throw err;
        }
        const created = {
          _id: new Types.ObjectId(),
          ...doc,
        };
        sessionsInDb.push(created);
        return created;
      }),
    };

    const userModel: any = {
      findById: jest.fn(() => ({
        select: jest.fn(() => ({ exec: async () => ({ full_name: 'Test User' }) })),
      })),
    };

    const provider: any = {
      isConfigured: () => true,
      name: 'stringee',
      createAccessToken: jest.fn(async (userId: string) => ({
        token: `tok-${userId}`,
        expires_at: new Date(Date.now() + 3600000),
      })),
    };

    const gateway: any = { emitToUser: jest.fn() };
    const voipPush: any = { notifyIncomingCall: jest.fn(async () => undefined) };

    const service = new CallsService(
      callSessionModel,
      jobModel,
      userModel,
      provider,
      gateway,
      voipPush,
      {} as never,
    );

    // Concurrent call: customer calls helper AND helper calls customer at the same time
    const [resCustomer, resHelper] = await Promise.all([
      service.initiateCall(String(jobId), String(customerId)),
      service.initiateCall(String(jobId), String(helperId)),
    ]);

    // Only 1 session in DB
    expect(sessionsInDb).toHaveLength(1);
    expect(resCustomer.session_id).toBe(String(sessionsInDb[0]._id));
    expect(resHelper.session_id).toBe(String(sessionsInDb[0]._id));

    // Customer's callee/partner is Helper
    expect(resCustomer.partner_id).toBe(String(helperId));
    expect(resCustomer.callee_id).toBe(String(helperId));

    // Helper's callee/partner is Customer (NOT helper themselves!)
    expect(resHelper.partner_id).toBe(String(customerId));
    expect(resHelper.callee_id).toBe(String(customerId));
  });
});
