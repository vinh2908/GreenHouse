import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { InvoicesService, paymentMethodLabel } from './invoices.service';

/** Spec B54: hóa đơn có số duy nhất + bản ghi lưu trữ, chỉ xuất khi đã thanh toán. */
describe('InvoicesService (B54)', () => {
  const jobId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const helperId = new Types.ObjectId();

  function makeService(
    opts: { paymentStatus: string; existingInvoice?: any } = { paymentStatus: 'paid' },
  ) {
    const job: any = {
      _id: jobId,
      customer_id: { _id: customerId, full_name: 'Nguyễn Văn A', phone: '0901234567' },
      helper_id: { _id: helperId, full_name: 'Trần Thị B' },
      service_id: { name: 'Dọn nhà' },
      title: 'Dọn căn hộ 2 phòng ngủ',
      address: { full_address: '123 Lê Lợi', district: 'Hải Châu', city: 'Đà Nẵng' },
      status: 'completed',
      payment_status: opts.paymentStatus,
      payment_method: 'momo',
      discount_amount: 0,
      loyalty_discount_amount: 0,
      loyalty_points_requested: 0,
      sos_surcharge: 0,
      voucher_code: undefined,
    };
    const query: any = {
      populate: jest.fn(() => query),
      exec: jest.fn().mockResolvedValue(job),
    };
    const jobModel: any = { findById: jest.fn().mockReturnValue(query) };
    const contractModel: any = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ total_price: 500_000 }),
      }),
    };
    const created: any[] = [];
    const invoiceModel: any = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(opts.existingInvoice ?? null),
      }),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
      create: jest.fn(async (doc: any) => {
        const rec = { ...doc, _id: new Types.ObjectId() };
        created.push(rec);
        return rec;
      }),
    };
    const service = new InvoicesService(jobModel, contractModel, invoiceModel);
    return { service, job, created, invoiceModel };
  }

  it('đơn chưa thanh toán → xuất hóa đơn → bị chặn (400)', async () => {
    const { service } = makeService({ paymentStatus: 'unpaid' });
    await expect(
      service.generateInvoicePdf(String(jobId), String(customerId), []),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('đơn đã thanh toán 500.000₫ → xuất hóa đơn có số INV-... duy nhất, lưu trong DB', async () => {
    const { service, created } = makeService({ paymentStatus: 'paid' });
    const { buffer, fileName } = await service.generateInvoicePdf(
      String(jobId),
      String(customerId),
      [],
    );
    expect(buffer.length).toBeGreaterThan(0);
    expect(created.length).toBe(1);
    expect(created[0].invoice_no).toMatch(/^INV-\d{8}-\d{4}$/);
    expect(created[0].job_id).toBe(jobId);
    expect(created[0].total_amount).toBe(500_000);
    expect(fileName).toBe(`hoa-don-${created[0].invoice_no}.pdf`);
  });

  it('xuất lại hóa đơn cho cùng đơn → dùng lại số cũ, không tạo bản ghi mới', async () => {
    const existing = {
      _id: new Types.ObjectId(),
      invoice_no: 'INV-20261107-0001',
      job_id: jobId,
      total_amount: 500_000,
      issued_at: new Date(),
    };
    const { service, created, invoiceModel } = makeService({
      paymentStatus: 'paid',
      existingInvoice: existing,
    });
    const { fileName } = await service.generateInvoicePdf(String(jobId), String(customerId), []);
    expect(fileName).toBe('hoa-don-INV-20261107-0001.pdf');
    expect(created.length).toBe(0);
    expect(invoiceModel.create).not.toHaveBeenCalled();
  });

  describe('nhãn phương thức thanh toán (B54)', () => {
    it('momo / zalopay / wallet → "Ví GreenHouse", không còn chữ MoMo/ZaloPay', () => {
      for (const method of ['momo', 'zalopay', 'wallet']) {
        const label = paymentMethodLabel(method);
        expect(label).toBe('Ví GreenHouse');
        expect(label).not.toMatch(/MoMo|ZaloPay/);
      }
    });

    it('cash → "Tiền mặt", vietqr → "Chuyển khoản VietQR"', () => {
      expect(paymentMethodLabel('cash')).toBe('Tiền mặt');
      expect(paymentMethodLabel('vietqr')).toBe('Chuyển khoản VietQR');
    });
  });
});
