import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MonthlyContract,
  MonthlyContractDocument,
  AttendanceRecord,
  AttendanceRecordDocument,
  LeaveRequest,
  LeaveRequestDocument,
  MonthlySettlement,
  MonthlySettlementDocument,
} from './schemas/monthly-contract.schema';
import { CreateMonthlyContractDto, SettleMonthDto } from './dto/monthly-contract.dto';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { VerificationStatus } from '@homemate/types';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface SettlementSummary {
  contract_id: string;
  month: string;
  scheduled_days: number;
  confirmed_days: number;
  leave_days: number;
  absent_days: number;
  gross_amount: number;
  platform_fee: number;
  helper_receives: number;
  status: 'settled' | 'preview';
  settled_at?: Date;
}

/**
 * Hợp đồng giúp việc theo tháng (Feature 08).
 *
 * - Lịch buổi làm tính "on the fly" từ schedule.days_of_week (quy ước JS
 *   Date.getDay(): 0 = Chủ nhật … 6 = Thứ 7) giao với [start_date, end_date]
 *   — không cần cron/bảng lịch riêng.
 * - Ngày theo giờ server (định dạng 'YYYY-MM-DD' bằng thành phần ngày local).
 * - Chốt lương: gross = round(lương tháng × buổi confirmed / buổi theo lịch).
 *   Buổi theo lịch trong quá khứ mà KHÔNG có bản ghi điểm danh được tính là
 *   vắng (absent) trong bản tóm tắt — thợ quên check-in thì khách vẫn có thể
 *   xác nhận/vắng khi có bản ghi 'checked_in'; buổi không có bản ghi chỉ ảnh
 *   hưởng tỉ lệ lương, không tự tạo record.
 */
@Injectable()
export class MonthlyContractsService {
  constructor(
    @InjectModel(MonthlyContract.name)
    private contractModel: Model<MonthlyContractDocument>,
    @InjectModel(AttendanceRecord.name)
    private attendanceModel: Model<AttendanceRecordDocument>,
    @InjectModel(LeaveRequest.name)
    private leaveModel: Model<LeaveRequestDocument>,
    @InjectModel(MonthlySettlement.name)
    private settlementModel: Model<MonthlySettlementDocument>,
    @InjectModel(HelperProfile.name)
    private helperModel: Model<HelperProfileDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Giống JobsService.isVerifiedHelper: HelperProfile có e-KYC đã duyệt. */
  private async isVerifiedHelper(userId: string): Promise<boolean> {
    const found = await this.helperModel
      .exists({
        user_id: new Types.ObjectId(userId),
        verification_status: VerificationStatus.APPROVED,
      })
      .exec();
    return !!found;
  }

  private todayStr(): string {
    const d = new Date();
    return this.toDateStr(d);
  }

  private toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private assertMonth(month?: string): string {
    const m = month ?? this.todayStr().slice(0, 7);
    if (!MONTH_RE.test(m)) throw new BadRequestException('month phải có dạng YYYY-MM');
    return m;
  }

  /** Danh sách ngày 'YYYY-MM-DD' theo lịch của hợp đồng trong 1 tháng. */
  scheduledDatesOfMonth(contract: MonthlyContractDocument, month: string): string[] {
    const [y, m] = month.split('-').map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0); // ngày cuối tháng
    const from = new Date(Math.max(monthStart.getTime(), new Date(contract.start_date).getTime()));
    // So sánh theo ngày: chuẩn hoá start/end về đầu ngày local
    from.setHours(0, 0, 0, 0);
    const contractEnd = contract.end_date ? new Date(contract.end_date) : null;
    if (contractEnd) contractEnd.setHours(0, 0, 0, 0);
    const to = contractEnd && contractEnd < monthEnd ? contractEnd : monthEnd;

    const days = new Set(contract.schedule?.days_of_week ?? []);
    const result: string[] = [];
    const cursor = new Date(from);
    while (cursor <= to) {
      if (days.has(cursor.getDay())) result.push(this.toDateStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  private async getContractOrFail(id: string): Promise<MonthlyContractDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Không tìm thấy hợp đồng');
    const contract = await this.contractModel.findById(id).exec();
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
    return contract;
  }

  private assertParticipant(contract: MonthlyContractDocument, userId: string) {
    if (contract.customer_id.toString() !== userId && contract.helper_id.toString() !== userId) {
      throw new ForbiddenException('Bạn không thuộc hợp đồng này');
    }
  }

  private populate(contract: MonthlyContractDocument) {
    return contract.populate([
      { path: 'customer_id', select: 'full_name avatar phone' },
      { path: 'helper_id', select: 'full_name avatar phone' },
      { path: 'service_id', select: 'name slug icon' },
    ]);
  }

  // ─── CRUD / vòng đời hợp đồng ─────────────────────────────────────────────

  async createContract(customerId: string, dto: CreateMonthlyContractDto) {
    if (dto.helper_id === customerId) {
      throw new BadRequestException('Không thể tự thuê chính mình');
    }
    if (!(await this.isVerifiedHelper(dto.helper_id))) {
      throw new BadRequestException(
        'Thợ này chưa hoàn tất xác thực e-KYC nên chưa thể ký hợp đồng theo tháng',
      );
    }
    const start = new Date(dto.start_date);
    const end = dto.end_date ? new Date(dto.end_date) : undefined;
    if (end && end < start) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    }

    const contract = await this.contractModel.create({
      customer_id: new Types.ObjectId(customerId),
      helper_id: new Types.ObjectId(dto.helper_id),
      service_id: dto.service_id ? new Types.ObjectId(dto.service_id) : undefined,
      title: dto.title,
      monthly_salary: dto.monthly_salary,
      platform_fee_percent: 15,
      address: {
        ...dto.address,
        location: {
          type: 'Point',
          coordinates: dto.address.location.coordinates,
        },
      },
      schedule: {
        days_of_week: [...new Set(dto.schedule.days_of_week)].sort((a, b) => a - b),
        time_start: dto.schedule.time_start,
        time_end: dto.schedule.time_end,
      },
      start_date: start,
      end_date: end,
      status: 'pending',
    });

    await this.notificationsService.create({
      userId: dto.helper_id,
      type: 'monthly_contract_new',
      title: '📅 Đề nghị hợp đồng theo tháng mới',
      body: `Khách hàng mời bạn làm giúp việc theo tháng: "${dto.title}" — lương ${dto.monthly_salary.toLocaleString('vi-VN')}₫/tháng. Mở app để xem và phản hồi.`,
      payload: { contract_id: String(contract._id), kind: 'monthly_contract' },
    });

    return this.populate(contract);
  }

  async listMyContracts(userId: string, as: 'customer' | 'helper') {
    const filter =
      as === 'helper'
        ? { helper_id: new Types.ObjectId(userId) }
        : { customer_id: new Types.ObjectId(userId) };
    const contracts = await this.contractModel
      .find(filter)
      .sort({ created_at: -1 })
      .populate('customer_id', 'full_name avatar phone')
      .populate('helper_id', 'full_name avatar phone')
      .populate('service_id', 'name slug icon')
      .exec();
    return contracts;
  }

  async getContract(userId: string, id: string) {
    const contract = await this.getContractOrFail(id);
    this.assertParticipant(contract, userId);
    return this.populate(contract);
  }

  async respond(helperId: string, id: string, accept: boolean) {
    const contract = await this.getContractOrFail(id);
    if (contract.helper_id.toString() !== helperId) {
      throw new ForbiddenException('Chỉ thợ được mời mới phản hồi được hợp đồng này');
    }
    if (contract.status !== 'pending') {
      throw new ConflictException('Hợp đồng này đã được phản hồi trước đó');
    }
    contract.status = accept ? 'active' : 'rejected';
    contract.responded_at = new Date();
    await contract.save();

    await this.notificationsService.create({
      userId: contract.customer_id.toString(),
      type: accept ? 'monthly_contract_accepted' : 'monthly_contract_rejected',
      title: accept
        ? '✅ Thợ đã nhận hợp đồng theo tháng'
        : '❌ Thợ đã từ chối hợp đồng theo tháng',
      body: accept
        ? `Hợp đồng "${contract.title}" đã có hiệu lực từ ${this.toDateStr(new Date(contract.start_date))}.`
        : `Thợ đã từ chối hợp đồng "${contract.title}". Bạn có thể mời thợ khác.`,
      payload: { contract_id: String(contract._id), kind: 'monthly_contract' },
    });
    return this.populate(contract);
  }

  async cancel(userId: string, id: string) {
    const contract = await this.getContractOrFail(id);
    this.assertParticipant(contract, userId);
    if (contract.status !== 'pending' && contract.status !== 'active') {
      throw new ConflictException('Hợp đồng này không thể hủy ở trạng thái hiện tại');
    }
    contract.status = 'cancelled';
    contract.ended_at = new Date();
    contract.end_reason =
      'Đã hủy bởi ' + (contract.customer_id.toString() === userId ? 'khách hàng' : 'thợ');
    await contract.save();

    const otherId =
      contract.customer_id.toString() === userId
        ? contract.helper_id.toString()
        : contract.customer_id.toString();
    await this.notificationsService.create({
      userId: otherId,
      type: 'monthly_contract_cancelled',
      title: '🚫 Hợp đồng theo tháng đã bị hủy',
      body: `Hợp đồng "${contract.title}" đã bị hủy.`,
      payload: { contract_id: String(contract._id), kind: 'monthly_contract' },
    });
    return this.populate(contract);
  }

  async end(userId: string, id: string, reason?: string) {
    const contract = await this.getContractOrFail(id);
    this.assertParticipant(contract, userId);
    if (contract.status !== 'active') {
      throw new ConflictException('Chỉ hợp đồng đang hiệu lực mới kết thúc được');
    }
    contract.status = 'ended';
    contract.ended_at = new Date();
    contract.end_reason = reason;
    await contract.save();

    const otherId =
      contract.customer_id.toString() === userId
        ? contract.helper_id.toString()
        : contract.customer_id.toString();
    await this.notificationsService.create({
      userId: otherId,
      type: 'monthly_contract_ended',
      title: '🏁 Hợp đồng theo tháng đã kết thúc',
      body: `Hợp đồng "${contract.title}" đã kết thúc${reason ? `: ${reason}` : ''}.`,
      payload: { contract_id: String(contract._id), kind: 'monthly_contract' },
    });
    return this.populate(contract);
  }

  // ─── Điểm danh ────────────────────────────────────────────────────────────

  async checkin(helperId: string, id: string) {
    const contract = await this.getContractOrFail(id);
    if (contract.helper_id.toString() !== helperId) {
      throw new ForbiddenException('Chỉ thợ của hợp đồng mới điểm danh được');
    }
    if (contract.status !== 'active') {
      throw new ConflictException('Hợp đồng chưa có hiệu lực hoặc đã kết thúc');
    }
    const today = this.todayStr();
    const month = today.slice(0, 7);
    if (!this.scheduledDatesOfMonth(contract, month).includes(today)) {
      throw new BadRequestException('Hôm nay không nằm trong lịch làm việc của hợp đồng');
    }
    const existing = await this.attendanceModel
      .findOne({ contract_id: contract._id, date: today })
      .exec();
    if (existing) {
      if (existing.status === 'leave') {
        throw new ConflictException('Hôm nay bạn đã được duyệt nghỉ phép');
      }
      throw new ConflictException('Bạn đã điểm danh hôm nay rồi');
    }
    // Đơn xin nghỉ đã duyệt nhưng chưa có record (phòng trường hợp dữ liệu lệch)
    const approvedLeave = await this.leaveModel
      .findOne({ contract_id: contract._id, date: today, status: 'approved' })
      .exec();
    if (approvedLeave) {
      throw new ConflictException('Hôm nay bạn đã được duyệt nghỉ phép');
    }

    const record = await this.attendanceModel.create({
      contract_id: contract._id,
      date: today,
      status: 'checked_in',
      checkin_at: new Date(),
    });

    await this.notificationsService.create({
      userId: contract.customer_id.toString(),
      type: 'monthly_contract_checkin',
      title: '🟢 Thợ đã điểm danh hôm nay',
      body: `Thợ của hợp đồng "${contract.title}" đã điểm danh ngày ${today}. Vui lòng xác nhận buổi làm.`,
      payload: { contract_id: String(contract._id), date: today, kind: 'monthly_contract' },
    });
    return record;
  }

  async getAttendance(userId: string, id: string, month?: string) {
    const contract = await this.getContractOrFail(id);
    this.assertParticipant(contract, userId);
    const m = this.assertMonth(month);
    const scheduled = this.scheduledDatesOfMonth(contract, m);
    const records = await this.attendanceModel
      .find({ contract_id: contract._id, date: { $regex: `^${m}-` } })
      .sort({ date: 1 })
      .exec();
    return {
      contract_id: String(contract._id),
      month: m,
      scheduled_dates: scheduled,
      records,
      today: this.todayStr(),
    };
  }

  async confirmAttendance(customerId: string, id: string, date: string, approve: boolean) {
    if (!DATE_RE.test(date)) throw new BadRequestException('date phải có dạng YYYY-MM-DD');
    const contract = await this.getContractOrFail(id);
    if (contract.customer_id.toString() !== customerId) {
      throw new ForbiddenException('Chỉ khách hàng của hợp đồng mới xác nhận điểm danh được');
    }
    const record = await this.attendanceModel.findOne({ contract_id: contract._id, date }).exec();
    if (!record) throw new NotFoundException('Không tìm thấy bản ghi điểm danh của ngày này');
    if (record.status !== 'checked_in') {
      throw new ConflictException('Buổi này đã được xử lý trước đó');
    }
    record.status = approve ? 'confirmed' : 'absent';
    record.confirmed_at = new Date();
    await record.save();

    await this.notificationsService.create({
      userId: contract.helper_id.toString(),
      type: 'monthly_contract_attendance',
      title: approve ? '✅ Buổi làm đã được xác nhận' : '❌ Buổi làm bị đánh dấu vắng',
      body: `Buổi làm ngày ${date} của hợp đồng "${contract.title}" ${
        approve ? 'đã được khách xác nhận có mặt' : 'đã bị khách đánh dấu vắng'
      }.`,
      payload: { contract_id: String(contract._id), date, kind: 'monthly_contract' },
    });
    return record;
  }

  // ─── Xin nghỉ ─────────────────────────────────────────────────────────────

  async requestLeave(helperId: string, id: string, dto: { date: string; reason: string }) {
    const contract = await this.getContractOrFail(id);
    if (contract.helper_id.toString() !== helperId) {
      throw new ForbiddenException('Chỉ thợ của hợp đồng mới xin nghỉ được');
    }
    if (contract.status !== 'active') {
      throw new ConflictException('Hợp đồng chưa có hiệu lực hoặc đã kết thúc');
    }
    if (dto.date <= this.todayStr()) {
      throw new BadRequestException('Chỉ xin nghỉ được cho ngày trong tương lai');
    }
    const month = dto.date.slice(0, 7);
    if (!this.scheduledDatesOfMonth(contract, month).includes(dto.date)) {
      throw new BadRequestException('Ngày xin nghỉ không nằm trong lịch làm việc');
    }
    const [existingRecord, pendingLeave] = await Promise.all([
      this.attendanceModel.findOne({ contract_id: contract._id, date: dto.date }).exec(),
      this.leaveModel
        .findOne({ contract_id: contract._id, date: dto.date, status: 'pending' })
        .exec(),
    ]);
    if (existingRecord) throw new ConflictException('Ngày này đã có bản ghi điểm danh/nghỉ');
    if (pendingLeave)
      throw new ConflictException('Bạn đã có đơn xin nghỉ đang chờ duyệt cho ngày này');

    const leave = await this.leaveModel.create({
      contract_id: contract._id,
      helper_id: new Types.ObjectId(helperId),
      date: dto.date,
      reason: dto.reason,
      status: 'pending',
    });

    await this.notificationsService.create({
      userId: contract.customer_id.toString(),
      type: 'monthly_contract_leave_request',
      title: '🌴 Thợ xin nghỉ 1 buổi',
      body: `Thợ của hợp đồng "${contract.title}" xin nghỉ ngày ${dto.date}: ${dto.reason}`,
      payload: {
        contract_id: String(contract._id),
        leave_id: String(leave._id),
        kind: 'monthly_contract',
      },
    });
    return leave;
  }

  async listLeaveRequests(userId: string, id: string) {
    const contract = await this.getContractOrFail(id);
    this.assertParticipant(contract, userId);
    return this.leaveModel
      .find({ contract_id: contract._id })
      .sort({ date: -1, created_at: -1 })
      .exec();
  }

  async respondLeave(customerId: string, id: string, leaveId: string, approve: boolean) {
    const contract = await this.getContractOrFail(id);
    if (contract.customer_id.toString() !== customerId) {
      throw new ForbiddenException('Chỉ khách hàng của hợp đồng mới duyệt nghỉ được');
    }
    if (!Types.ObjectId.isValid(leaveId))
      throw new NotFoundException('Không tìm thấy đơn xin nghỉ');
    const leave = await this.leaveModel.findById(leaveId).exec();
    if (!leave || leave.contract_id.toString() !== String(contract._id)) {
      throw new NotFoundException('Không tìm thấy đơn xin nghỉ');
    }
    if (leave.status !== 'pending') {
      throw new ConflictException('Đơn xin nghỉ này đã được xử lý');
    }
    leave.status = approve ? 'approved' : 'rejected';
    leave.responded_at = new Date();
    await leave.save();

    if (approve) {
      // Tạo bản ghi 'leave' cho ngày đó (unique theo contract+date)
      await this.attendanceModel.findOneAndUpdate(
        { contract_id: contract._id, date: leave.date },
        {
          $setOnInsert: {
            contract_id: contract._id,
            date: leave.date,
            status: 'leave',
            note: `Nghỉ phép đã duyệt: ${leave.reason}`,
          },
        },
        { upsert: true, new: true },
      );
    }

    await this.notificationsService.create({
      userId: contract.helper_id.toString(),
      type: 'monthly_contract_leave_response',
      title: approve ? '✅ Đơn xin nghỉ đã được duyệt' : '❌ Đơn xin nghỉ bị từ chối',
      body: `Đơn xin nghỉ ngày ${leave.date} của hợp đồng "${contract.title}" ${
        approve ? 'đã được khách duyệt' : 'đã bị khách từ chối'
      }.`,
      payload: {
        contract_id: String(contract._id),
        leave_id: String(leave._id),
        kind: 'monthly_contract',
      },
    });
    return leave;
  }

  // ─── Chốt lương tháng ─────────────────────────────────────────────────────

  async computeSummary(
    contract: MonthlyContractDocument,
    month: string,
  ): Promise<SettlementSummary> {
    const scheduled = this.scheduledDatesOfMonth(contract, month);
    const records = await this.attendanceModel
      .find({ contract_id: contract._id, date: { $regex: `^${month}-` } })
      .exec();
    const byDate = new Map(records.map(r => [r.date, r.status]));
    const today = this.todayStr();

    let confirmed = 0;
    let leave = 0;
    let absent = 0;
    for (const date of scheduled) {
      const st = byDate.get(date);
      if (st === 'confirmed') confirmed += 1;
      else if (st === 'leave') leave += 1;
      else if (st === 'absent') absent += 1;
      else if (!st && date < today) absent += 1; // quá khứ không có record = vắng
      // 'checked_in' chưa xác nhận & ngày hôm nay/tương lai: chưa tính
    }

    const scheduledDays = scheduled.length;
    const gross =
      scheduledDays > 0 ? Math.round((contract.monthly_salary * confirmed) / scheduledDays) : 0;
    const fee = Math.round((gross * (contract.platform_fee_percent ?? 15)) / 100);
    return {
      contract_id: String(contract._id),
      month,
      scheduled_days: scheduledDays,
      confirmed_days: confirmed,
      leave_days: leave,
      absent_days: absent,
      gross_amount: gross,
      platform_fee: fee,
      helper_receives: gross - fee,
      status: 'preview',
    };
  }

  async getSettlement(userId: string, id: string, month?: string) {
    const contract = await this.getContractOrFail(id);
    this.assertParticipant(contract, userId);
    const m = this.assertMonth(month);
    const existing = await this.settlementModel
      .findOne({ contract_id: contract._id, month: m })
      .exec();
    if (existing) {
      return {
        contract_id: String(contract._id),
        month: m,
        scheduled_days: existing.scheduled_days,
        confirmed_days: existing.confirmed_days,
        leave_days: existing.leave_days,
        absent_days: existing.absent_days,
        gross_amount: existing.gross_amount,
        platform_fee: existing.platform_fee,
        helper_receives: existing.helper_receives,
        status: 'settled' as const,
        settled_at: existing.settled_at,
        settlement_id: String(existing._id),
      };
    }
    return this.computeSummary(contract, m);
  }

  async settle(customerId: string, id: string, dto: SettleMonthDto) {
    const contract = await this.getContractOrFail(id);
    if (contract.customer_id.toString() !== customerId) {
      throw new ForbiddenException('Chỉ khách hàng của hợp đồng mới chốt lương được');
    }
    if (contract.status !== 'active' && contract.status !== 'ended') {
      throw new ConflictException('Hợp đồng chưa có hiệu lực hoặc đã bị hủy/từ chối');
    }
    // Cho phép chốt tháng đã qua HOẶC tháng hiện tại (chốt sớm theo số buổi đã
    // xác nhận tính đến hiện tại). Tháng tương lai bị chặn.
    const currentMonth = this.todayStr().slice(0, 7);
    if (dto.month > currentMonth) {
      throw new BadRequestException('Chưa thể chốt lương cho tháng trong tương lai');
    }
    const existing = await this.settlementModel
      .findOne({ contract_id: contract._id, month: dto.month })
      .exec();
    if (existing) {
      throw new ConflictException(`Tháng ${dto.month} đã được chốt lương rồi`);
    }

    const summary = await this.computeSummary(contract, dto.month);
    const settlement = await this.settlementModel.create({
      contract_id: contract._id,
      month: dto.month,
      scheduled_days: summary.scheduled_days,
      confirmed_days: summary.confirmed_days,
      leave_days: summary.leave_days,
      absent_days: summary.absent_days,
      gross_amount: summary.gross_amount,
      platform_fee: summary.platform_fee,
      helper_receives: summary.helper_receives,
      status: 'settled',
      settled_at: new Date(),
      settled_by: new Types.ObjectId(customerId),
    });

    // Cộng tiền vào ví thợ qua PaymentsService.creditWallet (không gắn Job):
    // reference = MONTHLY-<contractId last6>-<month> để đối soát trong ví.
    if (summary.helper_receives > 0) {
      await this.paymentsService.creditWallet(
        contract.helper_id.toString(),
        summary.helper_receives,
        {
          description: `Lương tháng ${dto.month} — hợp đồng "${contract.title}" (${summary.confirmed_days}/${summary.scheduled_days} buổi, đã trừ phí sàn ${contract.platform_fee_percent ?? 15}%)`,
          reference: `MONTHLY-${String(contract._id).slice(-6)}-${dto.month}`,
          type: 'earning',
        },
      );
    }

    await this.notificationsService.create({
      userId: contract.helper_id.toString(),
      type: 'monthly_contract_settled',
      title: '💰 Đã chốt lương tháng ' + dto.month,
      body: `Hợp đồng "${contract.title}": ${summary.confirmed_days}/${summary.scheduled_days} buổi — bạn nhận ${summary.helper_receives.toLocaleString('vi-VN')}₫ vào ví.`,
      payload: { contract_id: String(contract._id), month: dto.month, kind: 'monthly_contract' },
    });

    return {
      ...summary,
      status: 'settled' as const,
      settled_at: settlement.settled_at,
      settlement_id: String(settlement._id),
    };
  }

  // ─── Admin Management ───────────────────────────────────────────────────────

  async adminListContracts(status?: string, page = 1, limit = 20) {
    const query: Record<string, unknown> = {};
    if (status && status !== 'all') {
      query['status'] = status;
    }
    const skip = (page - 1) * limit;
    const [contracts, total] = await Promise.all([
      this.contractModel
        .find(query)
        .populate('customer_id', 'full_name phone avatar')
        .populate('helper_id', 'full_name phone avatar')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.contractModel.countDocuments(query).exec(),
    ]);
    return {
      contracts,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }
}
