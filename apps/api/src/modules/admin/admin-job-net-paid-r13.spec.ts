import { Types } from 'mongoose';
import { AdminService } from './admin.service';

/**
 * R13-B3 — Admin job page shows "Khách đã trả (Net paid): 50.000₫" on an
 * UNPAID job (live 2026-11-18, phantom job 6afd23e9f8184581c5d1ce86).
 *
 * Root cause: `AdminService.getJobById` computed `net_paid` with
 * `computeNetPaidAmount` — contract price minus discounts — and displayed
 * it as "amount actually paid", without ever consulting payments. An
 * UNPAID job with a 50.000₫ contract therefore showed net_paid 50.000₫
 * next to "Giá hợp đồng: 0₫" (a second bug: `contract.final_price` does
 * not exist in the schema). After the fix `net_paid` is min(contract net
 * price, actually paid via `PaymentsService.getTotalPaidForJob`); cash
 * counts only when the helper confirmed receipt (cash moves off-platform,
 * so the transaction total is 0); warranty jobs are 0₫.
 *
 * FAILS on base d06aa9c: UNPAID / cash-unconfirmed / warranty cases return
 * the contract price instead of 0.
 */
describe('AdminService.getJobById — R13-B3 net_paid is money actually paid', () => {
  function makeService(jobDoc: any, contractDoc: any, totalPaid: number) {
    const chainable: any = {};
    chainable.populate = jest.fn(() => chainable);
    chainable.lean = jest.fn(() => ({ exec: async () => jobDoc }));
    const jobModel: any = { findById: jest.fn(() => chainable) };
    const quoteChain: any = {};
    quoteChain.populate = jest.fn(() => quoteChain);
    quoteChain.sort = jest.fn(() => ({
      lean: jest.fn(() => ({ exec: async () => [] })),
    }));
    const quoteModel: any = { find: jest.fn(() => quoteChain) };
    const contractModel: any = {
      findOne: jest.fn(() => ({ lean: jest.fn(() => ({ exec: async () => contractDoc })) })),
    };
    const paymentsService: any = { getTotalPaidForJob: jest.fn(async () => totalPaid) };
    const dummy = {} as never;
    const service = new AdminService(
      dummy, dummy, jobModel, contractModel, dummy, dummy, dummy, dummy, dummy, dummy,
      dummy, dummy, dummy, paymentsService, dummy, quoteModel, dummy,
    );
    return service;
  }

  function makeJob(over: Record<string, unknown> = {}): any {
    return {
      _id: new Types.ObjectId(),
      customer_id: 'cust1',
      helper_id: 'help1',
      status: 'pending_review',
      payment_status: 'unpaid',
      payment_method: 'vietqr',
      total_price: 50_000,
      fixed_price: 50_000,
      discount_amount: 0,
      loyalty_discount_amount: 0,
      refunded_amount: 0,
      ...over,
    };
  }

  function makeContract(totalPrice = 50_000): any {
    return { total_price: totalPrice, helper_receives: 42_500, platform_fee: 7_500 };
  }

  it('UNPAID job + 50.000₫ contract → net_paid 0, max_refundable 0', async () => {
    const jobDoc = makeJob();
    const service = makeService(jobDoc, makeContract(), 0);
    const res = await service.getJobById(String(jobDoc._id));
    expect(res.net_paid).toBe(0);
    expect(res.max_refundable).toBe(0);
  });

  it('PAID wallet job (50.000₫ really paid) → net_paid 50.000₫', async () => {
    const jobDoc = makeJob({ payment_status: 'paid', payment_method: 'wallet' });
    const service = makeService(jobDoc, makeContract(), 50_000);
    const res = await service.getJobById(String(jobDoc._id));
    expect(res.net_paid).toBe(50_000);
    expect(res.max_refundable).toBe(50_000);
  });

  it('cash job with helper_cash_confirmed → net_paid is the contract price (cash is off-platform)', async () => {
    const jobDoc = makeJob({
      payment_status: 'paid',
      payment_method: 'cash',
      helper_cash_confirmed: true,
    });
    const service = makeService(jobDoc, makeContract(), 0);
    const res = await service.getJobById(String(jobDoc._id));
    expect(res.net_paid).toBe(50_000);
  });

  it('cash job WITHOUT helper confirmation → net_paid 0 (cash receipt unverified)', async () => {
    const jobDoc = makeJob({
      payment_status: 'paid',
      payment_method: 'cash',
      helper_cash_confirmed: false,
    });
    const service = makeService(jobDoc, makeContract(), 0);
    const res = await service.getJobById(String(jobDoc._id));
    expect(res.net_paid).toBe(0);
  });

  it('warranty job → net_paid 0 even with a contract total', async () => {
    const jobDoc = makeJob({ is_warranty: true });
    const service = makeService(jobDoc, makeContract(), 0);
    const res = await service.getJobById(String(jobDoc._id));
    expect(res.net_paid).toBe(0);
  });

  it('partially paid job → net_paid is capped at the amount actually paid', async () => {
    const jobDoc = makeJob({ payment_status: 'paid', payment_method: 'wallet' });
    const service = makeService(jobDoc, makeContract(50_000), 20_000);
    const res = await service.getJobById(String(jobDoc._id));
    expect(res.net_paid).toBe(20_000);
  });

  it('partially refunded wallet job (paid 50k, refunded 20k) → net_paid 30k AND max_refundable 30k (no double subtraction)', async () => {
    // getTotalPaidForJob đã trả net (50k − 20k = 30k); trừ thêm
    // refunded_amount nữa thì max_refundable chỉ còn 10k — sai.
    const jobDoc = makeJob({
      payment_status: 'paid',
      payment_method: 'wallet',
      refunded_amount: 20_000,
    });
    const service = makeService(jobDoc, makeContract(50_000), 30_000);
    const res = await service.getJobById(String(jobDoc._id));
    expect(res.net_paid).toBe(30_000);
    expect(res.max_refundable).toBe(30_000);
  });

  it('partially refunded cash job (confirmed 50k, refunded 20k) → net_paid 50k, max_refundable 30k', async () => {
    // Tiền mặt: actuallyPaid là giá hợp đồng GỘP nên vẫn trừ
    // refunded_amount 1 lần ở nhánh cash.
    const jobDoc = makeJob({
      payment_status: 'paid',
      payment_method: 'cash',
      helper_cash_confirmed: true,
      refunded_amount: 20_000,
    });
    const service = makeService(jobDoc, makeContract(), 0);
    const res = await service.getJobById(String(jobDoc._id));
    expect(res.net_paid).toBe(50_000);
    expect(res.max_refundable).toBe(30_000);
  });
});
