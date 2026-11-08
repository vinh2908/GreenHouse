import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { Job, JobDocument, Contract, ContractDocument } from '../jobs/schemas/job.schema';
import { Invoice, InvoiceDocument } from './schemas/invoice.schema';
import { PaymentStatus } from '@homemate/types';
import { PdfBuilder, PDF_PAGE } from './pdf-invoice';

const FONT_FILES = { regular: 'DejaVuSans.ttf', bold: 'DejaVuSans-Bold.ttf' } as const;

/**
 * Tìm file font DejaVu đã vendor trong ./assets. Khi chạy từ dist (build
 * production), __dirname trỏ vào dist/modules/invoices (không có assets —
 * tsc không copy file .ttf) nên cần fallback về thư mục src tương ứng.
 */
function resolveFontPath(fileName: string): string {
  const candidates = [
    // Chạy trực tiếp từ src (ts-node / dev): assets nằm cạnh file này
    path.join(__dirname, 'assets', fileName),
    // Chạy từ apps/api/dist/modules/invoices → lên 3 cấp = apps/api, vào src
    path.join(__dirname, '..', '..', '..', 'src', 'modules', 'invoices', 'assets', fileName),
    // cwd = apps/api
    path.join(process.cwd(), 'src', 'modules', 'invoices', 'assets', fileName),
    // cwd = gốc repo
    path.join(process.cwd(), 'apps', 'api', 'src', 'modules', 'invoices', 'assets', fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new InternalServerErrorException(
    `Không tìm thấy font hóa đơn (${fileName}) trong thư mục assets của module invoices`,
  );
}

function formatVND(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')}₫`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

/**
 * Nhãn phương thức thanh toán hiển thị trên hóa đơn — ghi đúng thực tế.
 * MoMo/ZaloPay chưa tích hợp cổng thật: mọi thanh toán điện tử mô phỏng đều
 * đi qua ví/ký quỹ GreenHouse nên nhãn là "Ví GreenHouse", không ghi tên
 * cổng chưa tích hợp (B54).
 */
export function paymentMethodLabel(method?: string): string {
  switch (method) {
    case 'cash':
      return 'Tiền mặt';
    case 'vietqr':
      return 'Chuyển khoản VietQR';
    case 'wallet':
    case 'momo':
    case 'zalopay':
      return 'Ví GreenHouse';
    default:
      return method || '—';
  }
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private fontCache?: { regular: Buffer; bold: Buffer };

  constructor(
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(Contract.name) private contractModel: Model<ContractDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
  ) {}

  private loadFonts(): { regular: Buffer; bold: Buffer } {
    if (!this.fontCache) {
      this.fontCache = {
        regular: fs.readFileSync(resolveFontPath(FONT_FILES.regular)),
        bold: fs.readFileSync(resolveFontPath(FONT_FILES.bold)),
      };
    }
    return this.fontCache;
  }

  /**
   * Sinh PDF hóa đơn điện tử cho 1 job.
   * Quyền xem: khách của đơn, thợ của đơn, hoặc admin.
   * B54: Chỉ xuất khi đơn đã thanh toán (payment_status = paid) — đơn chưa
   * thanh toán (kể cả đã COMPLETED mà chưa PAID) không xuất được. Mỗi job chỉ
   * có 1 số hóa đơn duy nhất, lưu bản ghi trong DB; tải lại dùng lại số cũ.
   */
  async generateInvoicePdf(
    jobId: string,
    requesterId: string,
    roles: string[],
  ): Promise<{ buffer: Buffer; fileName: string }> {
    if (!Types.ObjectId.isValid(jobId)) throw new NotFoundException('Job không tồn tại');
    const job = await this.jobModel
      .findById(jobId)
      .populate('customer_id', 'full_name phone')
      .populate('helper_id', 'full_name phone')
      .populate('service_id', 'name')
      .exec();
    if (!job) throw new NotFoundException('Job không tồn tại');

    const customer = job.customer_id as unknown as {
      _id: Types.ObjectId;
      full_name?: string;
      phone?: string;
    };
    const helper = job.helper_id as unknown as { _id: Types.ObjectId; full_name?: string } | null;
    const isAdmin = roles.includes('admin');
    const isCustomer = customer?._id?.toString() === requesterId;
    const isHelper = helper?._id?.toString() === requesterId;
    if (!isAdmin && !isCustomer && !isHelper) {
      throw new ForbiddenException('Bạn không có quyền xem hóa đơn của đơn này');
    }

    if (job.payment_status !== PaymentStatus.PAID) {
      throw new BadRequestException(
        'Hóa đơn chỉ được xuất sau khi đơn đã thanh toán (payment_status phải là paid)',
      );
    }

    const contract = await this.contractModel.findOne({ job_id: new Types.ObjectId(jobId) }).exec();
    if (!contract) throw new BadRequestException('Đơn chưa có hợp đồng để xuất hóa đơn');

    const service = job.service_id as unknown as { name?: string } | null;
    const discount = job.discount_amount ?? 0;
    const loyaltyDiscount = job.loyalty_discount_amount ?? 0;
    const loyaltyPoints = job.loyalty_points_requested ?? 0;
    const sosSurcharge = job.sos_surcharge ?? 0;
    // Tổng thanh toán = giá hợp đồng − giảm voucher − giảm điểm thành viên + phụ phí SOS (nếu có)
    const grandTotal = Math.max(
      0,
      contract.total_price - discount - loyaltyDiscount + sosSurcharge,
    );

    const invoice = await this.getOrCreateInvoice(job, grandTotal);
    const invoiceNo = invoice.invoice_no;

    const buffer = this.renderPdf({
      invoiceNo,
      issuedAt: invoice.issued_at ?? new Date(),
      customerName: customer?.full_name ?? 'Khách hàng Green House',
      customerPhone: customer?.phone ?? '',
      helperName: helper?.full_name ?? '—',
      serviceName: service?.name ?? 'Dịch vụ',
      jobTitle: job.title,
      address: [job.address?.full_address, job.address?.district, job.address?.city]
        .filter(Boolean)
        .join(', '),
      totalPrice: contract.total_price,
      discount,
      voucherCode: job.voucher_code,
      loyaltyDiscount,
      loyaltyPoints,
      sosSurcharge,
      grandTotal,
      paymentMethod: job.payment_method ?? '',
    });

    return { buffer, fileName: `hoa-don-${invoiceNo}.pdf` };
  }

  /**
   * Cấp số hóa đơn duy nhất cho 1 job (idempotent): đã có bản ghi thì dùng
   * lại số cũ; chưa có thì cấp INV-YYYYMMDD-XXXX (XXXX = thứ tự trong ngày).
   * Unique index trên (invoice_no) và (job_id) chặn trùng khi 2 request cấp
   * số song song — request thua thử lại với số kế tiếp.
   */
  private async getOrCreateInvoice(
    job: JobDocument,
    totalAmount: number,
  ): Promise<InvoiceDocument> {
    const existing = await this.invoiceModel.findOne({ job_id: job._id }).exec();
    if (existing) return existing;

    const now = new Date();
    // Định dạng YYYYMMDD theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const day = formatter.format(now).replace(/-/g, '');
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    for (let attempt = 0; attempt < 5; attempt++) {
      const todayCount = await this.invoiceModel
        .countDocuments({ created_at: { $gte: dayStart, $lt: dayEnd } })
        .exec();
      const seq = todayCount + 1 + attempt;
      const invoiceNo = `INV-${day}-${String(seq).padStart(4, '0')}`;
      try {
        return await this.invoiceModel.create({
          invoice_no: invoiceNo,
          job_id: job._id,
          customer_id: job.customer_id,
          helper_id: job.helper_id ?? undefined,
          total_amount: totalAmount,
          payment_method: job.payment_method ?? '',
          payment_status: job.payment_status,
          issued_at: now,
        });
      } catch (err) {
        if ((err as { code?: number })?.code === 11000) {
          // Trùng số (hoặc đã có hóa đơn cho job này) → đọc lại / thử số kế
          const raced = await this.invoiceModel.findOne({ job_id: job._id }).exec();
          if (raced) return raced;
          continue;
        }
        throw err;
      }
    }
    throw new BadRequestException('Không thể cấp số hóa đơn, vui lòng thử lại');
  }

  // ─── Layout hóa đơn (A4, hệ tọa độ gốc trên-trái của PdfBuilder) ──────────

  private renderPdf(data: {
    invoiceNo: string;
    issuedAt: Date;
    customerName: string;
    customerPhone: string;
    helperName: string;
    serviceName: string;
    jobTitle: string;
    address: string;
    totalPrice: number;
    discount: number;
    voucherCode?: string;
    loyaltyDiscount: number;
    loyaltyPoints: number;
    sosSurcharge: number;
    grandTotal: number;
    paymentMethod: string;
  }): Buffer {
    const fonts = this.loadFonts();
    const pdf = new PdfBuilder();
    pdf.registerFont('F1', 'DejaVuSans', fonts.regular);
    pdf.registerFont('F2', 'DejaVuSans-Bold', fonts.bold);

    const W = PDF_PAGE.width;
    const MARGIN = 48;
    const RIGHT = W - MARGIN;
    const GREEN: [number, number, number] = [0.09, 0.45, 0.22];
    const DARK: [number, number, number] = [0.13, 0.13, 0.13];
    const GRAY: [number, number, number] = [0.42, 0.42, 0.42];
    const LIGHT: [number, number, number] = [0.93, 0.97, 0.94];
    const right = (
      x: number,
      y: number,
      text: string,
      opts?: Parameters<PdfBuilder['drawText']>[3],
    ) => {
      const size = opts?.size ?? 11;
      pdf.drawText(x - pdf.textWidth(text, opts?.font, size), y, text, opts);
    };

    // Header
    pdf.drawRect(0, 0, W, 92, GREEN);
    pdf.drawText(MARGIN, 38, 'GREEN HOUSE', { font: 'F2', size: 20, color: [1, 1, 1] });
    pdf.drawText(MARGIN, 60, 'Nền tảng dịch vụ giúp việc & sửa chữa tại nhà', {
      size: 10.5,
      color: [1, 1, 1],
    });
    right(RIGHT, 40, 'HÓA ĐƠN ĐIỆN TỬ', { font: 'F2', size: 15, color: [1, 1, 1] });
    right(RIGHT, 62, `Số hóa đơn: ${data.invoiceNo}`, { size: 10.5, color: [1, 1, 1] });
    right(RIGHT, 78, `Ngày xuất: ${formatDate(data.issuedAt)}`, { size: 10.5, color: [1, 1, 1] });

    // Thông tin các bên
    let y = 128;
    pdf.drawText(MARGIN, y, 'THÔNG TIN ĐƠN HÀNG', { font: 'F2', size: 12, color: GREEN });
    y += 22;
    const infoLines: [string, string][] = [
      ['Khách hàng', `${data.customerName}${data.customerPhone ? ` — ${data.customerPhone}` : ''}`],
      ['Thợ thực hiện', data.helperName],
      ['Dịch vụ', data.serviceName],
      ['Tiêu đề đơn', data.jobTitle],
      ['Địa chỉ làm việc', data.address],
    ];
    for (const [label, value] of infoLines) {
      pdf.drawText(MARGIN, y, `${label}:`, { font: 'F2', size: 10.5, color: DARK });
      pdf.drawText(MARGIN + 118, y, value, { size: 10.5, color: DARK });
      y += 18;
    }

    // Bảng chi tiết thanh toán
    y += 14;
    pdf.drawRect(MARGIN, y - 14, RIGHT - MARGIN, 26, LIGHT);
    pdf.drawText(MARGIN + 10, y, 'Khoản mục', { font: 'F2', size: 11, color: DARK });
    right(RIGHT - 10, y, 'Số tiền', { font: 'F2', size: 11, color: DARK });
    y += 8;
    pdf.drawLine(MARGIN, y, RIGHT - MARGIN, 1, GREEN);
    y += 22;

    const rows: { label: string; amount: string }[] = [
      { label: 'Giá dịch vụ', amount: formatVND(data.totalPrice) },
    ];
    if (data.discount > 0) {
      rows.push({
        label: `Giảm giá voucher${data.voucherCode ? ` (${data.voucherCode})` : ''}`,
        amount: `−${formatVND(data.discount)}`,
      });
    }
    if (data.loyaltyDiscount > 0) {
      rows.push({
        label: `Giảm giá điểm thành viên${data.loyaltyPoints > 0 ? ` (${data.loyaltyPoints} điểm)` : ''}`,
        amount: `−${formatVND(data.loyaltyDiscount)}`,
      });
    }
    if (data.sosSurcharge > 0) {
      rows.push({ label: 'Phụ phí SOS', amount: `+${formatVND(data.sosSurcharge)}` });
    }
    for (const row of rows) {
      pdf.drawText(MARGIN + 10, y, row.label, { size: 11, color: DARK });
      right(RIGHT - 10, y, row.amount, { size: 11, color: DARK });
      y += 16;
      pdf.drawLine(MARGIN, y, RIGHT - MARGIN, 0.5, [0.85, 0.85, 0.85]);
      y += 20;
    }

    // Tổng thanh toán
    pdf.drawRect(MARGIN, y - 16, RIGHT - MARGIN, 30, LIGHT);
    pdf.drawText(MARGIN + 10, y, 'TỔNG THANH TOÁN', { font: 'F2', size: 12.5, color: DARK });
    right(RIGHT - 10, y, formatVND(data.grandTotal), { font: 'F2', size: 12.5, color: GREEN });
    y += 34;

    // B54: Nhãn phương thức ghi đúng thực tế — xem paymentMethodLabel().
    const methodLabel = paymentMethodLabel(data.paymentMethod);
    pdf.drawText(MARGIN, y, `Phương thức thanh toán: ${methodLabel}`, { size: 11, color: DARK });
    y += 18;
    pdf.drawText(MARGIN, y, 'Trạng thái: ĐÃ THANH TOÁN', { font: 'F2', size: 11, color: GREEN });

    // Footer
    pdf.drawLine(MARGIN, 780, RIGHT - MARGIN, 0.7, [0.8, 0.8, 0.8]);
    pdf.drawText(
      MARGIN,
      798,
      'Hóa đơn được tạo tự động bởi hệ thống Green House — không cần chữ ký.',
      {
        size: 9.5,
        color: GRAY,
      },
    );
    pdf.drawText(
      MARGIN,
      813,
      `Số hóa đơn: ${data.invoiceNo} • Green House — Giúp việc tận tâm, an tâm mọi nhà.`,
      {
        size: 9.5,
        color: GRAY,
      },
    );

    return pdf.build();
  }
}
