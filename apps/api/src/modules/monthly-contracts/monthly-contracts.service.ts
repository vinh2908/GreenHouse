import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
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
import { Service, ServiceDocument } from '../services/schemas/service.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { VerificationStatus, UserRole } from '@homemate/types';
import { NOTIFICATION_TYPES } from '@homemate/constants';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { AppGateway } from '../chat/app.gateway';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const DEFAULT_MONTHLY_PLATFORM_FEE_PERCENT = 15;

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
 * - Chốt lương: gross = round(lương tháng × buổi đã làm / buổi theo lịch).
 *   Buổi đã làm = 'confirmed' (khách đã xác nhận) + 'checked_in' (thợ đã chấm
 *   công thực tế, kể cả khi khách chưa kịp xác nhận — B50).
 *   Buổi theo lịch trong quá khứ mà KHÔNG có bản ghi điểm danh được tính là
 *   vắng (absent) trong bản tóm tắt — thợ quên check-in thì khách vẫn có thể
 *   xác nhận/vắng khi có bản ghi 'checked_in'; buổi không có bản ghi chỉ ảnh
 *   hưởng tỉ lệ lương, không tự tạo record.
 */
@Injectable()
export class MonthlyContractsService {
  private readonly logger = new Logger(MonthlyContractsService.name);

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
    @InjectModel(Service.name)
    private serviceModel: Model<ServiceDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
    @Inject(forwardRef(() => AppGateway))
    private readonly gateway: AppGateway,
    @Optional()
    @InjectModel(User.name)
    private userModel?: Model<UserDocument>,
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

  // P1-17: Chuẩn hoá sang múi giờ Việt Nam Asia/Ho_Chi_Minh (UTC+7)
  private toVnDate(d: Date): Date {
    return new Date(d.getTime() + 7 * 60 * 60 * 1000);
  }

  private todayStr(): string {
    const d = new Date();
    return this.toDateStr(d);
  }

  private toDateStr(d: Date): string {
    const vn = this.toVnDate(d);
    const y = vn.getUTCFullYear();
    const m = String(vn.getUTCMonth() + 1).padStart(2, '0');
    const day = String(vn.getUTCDate()).padStart(2, '0');
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
      if (days.has(this.toVnDate(cursor).getUTCDay())) result.push(this.toDateStr(cursor));
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

  private assertParticipant(
    contract: MonthlyContractDocument,
    userId: string,
    userRoles: string[] = [],
  ) {
    if (userRoles.includes('admin') || userRoles.includes(UserRole.ADMIN)) return;
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
    // P2-20: Chặn tạo hợp đồng tháng khi tài khoản khách chưa xác minh email
    if (this.userModel?.findById) {
      const customerUser = await this.userModel
        .findById(customerId)
        .select('is_verified')
        .lean()
        .exec();
      if (customerUser && customerUser.is_verified === false) {
        throw new BadRequestException(
          'Tài khoản chưa được xác minh qua email. Vui lòng xác minh email trước khi tạo hợp đồng tháng.',
        );
      }
    }

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
    // B49: Ngày bắt đầu không được trong quá khứ (so theo ngày)
    if (dto.start_date.slice(0, 10) < this.todayStr()) {
      throw new BadRequestException('Ngày bắt đầu hợp đồng không được trong quá khứ');
    }
    // B49: Lương tháng tối đa 20.000.000₫
    if (dto.monthly_salary > 20_000_000) {
      throw new BadRequestException('Lương tháng tối đa là 20.000.000₫');
    }
    // B49: Không trùng lịch với hợp đồng đang chạy/chờ duyệt của cùng thợ.
    // So sánh khoảng [start, end] (end trống = không thời hạn). Hợp đồng của
    // 1 thợ ít nên lọc bằng JS cho rõ, tránh query ngày phức tạp.
    const running = await this.contractModel
      .find({
        helper_id: new Types.ObjectId(dto.helper_id),
        status: { $in: ['active', 'pending'] },
      })
      .select('start_date end_date')
      .exec();
    for (const other of running) {
      const otherStart = new Date(other.start_date);
      const otherEnd = other.end_date ? new Date(other.end_date) : null;
      const overlaps =
        (otherEnd === null || start <= otherEnd) && (end === undefined || otherStart <= end);
      if (overlaps) {
        throw new ConflictException(
          'Thợ đã có hợp đồng theo tháng trùng lịch trong khoảng thời gian này',
        );
      }
    }

    let platformFeePercent = DEFAULT_MONTHLY_PLATFORM_FEE_PERCENT;
    if (dto.service_id && typeof this.serviceModel?.findById === 'function') {
      const svc = await this.serviceModel.findById(dto.service_id).lean().exec();
      if (typeof svc?.platform_fee_percent === 'number') {
        platformFeePercent = svc.platform_fee_percent;
      }
    }

    const contract = await this.contractModel.create({
      customer_id: new Types.ObjectId(customerId),
      helper_id: new Types.ObjectId(dto.helper_id),
      service_id: dto.service_id ? new Types.ObjectId(dto.service_id) : undefined,
      title: dto.title,
      monthly_salary: dto.monthly_salary,
      platform_fee_percent: platformFeePercent,
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
      type: NOTIFICATION_TYPES.MONTHLY_CONTRACT_NEW,
      title: '📅 Đề nghị hợp đồng theo tháng mới',
      body: `Khách hàng mời bạn làm giúp việc theo tháng: "${dto.title}" — lương ${dto.monthly_salary.toLocaleString('vi-VN')}₫/tháng. Mở app để xem và phản hồi.`,
      payload: { contract_id: String(contract._id), kind: 'monthly_contract' },
    });

    // A85: Socket event cập nhật tức thì hợp đồng tháng
    const eventPayload = { contract_id: String(contract._id), status: contract.status };
    this.gateway.emitToUser(customerId, 'contract:created', eventPayload);
    this.gateway.emitToUser(dto.helper_id, 'contract:created', eventPayload);

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

  async getContract(userId: string, id: string, userRoles: string[] = []) {
    const contract = await this.getContractOrFail(id);
    this.assertParticipant(contract, userId, userRoles);
    return this.populate(contract);
  }

  async respond(helperId: string, id: string, accept: boolean, reason?: string) {
    const contract = await this.getContractOrFail(id);
    if (contract.helper_id.toString() !== helperId) {
      throw new ForbiddenException('Chỉ thợ được mời mới phản hồi được hợp đồng này');
    }
    if (contract.status !== 'pending') {
      throw new ConflictException('Hợp đồng này đã được phản hồi trước đó');
    }
    contract.status = accept ? 'active' : 'rejected';
    contract.responded_at = new Date();
    if (!accept && reason) {
      contract.end_reason = reason;
    }
    await contract.save();

    await this.notificationsService.create({
      userId: contract.customer_id.toString(),
      type: accept ? 'monthly_contract_accepted' : 'monthly_contract_rejected',
      title: accept
        ? '✅ Thợ đã nhận hợp đồng theo tháng'
        : '❌ Thợ đã từ chối hợp đồng theo tháng',
      body: accept
        ? `Hợp đồng "${contract.title}" đã có hiệu lực từ ${this.toDateStr(new Date(contract.start_date))}.`
        : reason
          ? `Thợ đã từ chối hợp đồng "${contract.title}": ${reason}`
          : `Thợ đã từ chối hợp đồng "${contract.title}". Bạn có thể mời thợ khác.`,
      payload: { contract_id: String(contract._id), kind: 'monthly_contract' },
    });
    return this.populate(contract);
  }

  async cancel(userId: string, id: string, reason?: string) {
    const contract = await this.getContractOrFail(id);
    this.assertParticipant(contract, userId);
    if (contract.status !== 'pending' && contract.status !== 'active') {
      throw new ConflictException('Hợp đồng này không thể hủy ở trạng thái hiện tại');
    }
    contract.status = 'cancelled';
    contract.ended_at = new Date();
    contract.end_reason =
      reason || 'Đã hủy bởi ' + (contract.customer_id.toString() === userId ? 'khách hàng' : 'thợ');
    await contract.save();

    const otherId =
      contract.customer_id.toString() === userId
        ? contract.helper_id.toString()
        : contract.customer_id.toString();
    await this.notificationsService.create({
      userId: otherId,
      type: NOTIFICATION_TYPES.MONTHLY_CONTRACT_CANCELLED,
      title: '🚫 Hợp đồng theo tháng đã bị hủy',
      body: reason
        ? `Hợp đồng "${contract.title}" đã bị hủy: ${reason}`
        : `Hợp đồng "${contract.title}" đã bị hủy.`,
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
    contract.end_date = new Date();
    contract.end_reason = reason;
    await contract.save();

    const otherId =
      contract.customer_id.toString() === userId
        ? contract.helper_id.toString()
        : contract.customer_id.toString();
    await this.notificationsService.create({
      userId: otherId,
      type: NOTIFICATION_TYPES.MONTHLY_CONTRACT_ENDED,
      title: '🏁 Hợp đồng theo tháng đã kết thúc',
      body: `Hợp đồng "${contract.title}" đã kết thúc${reason ? `: ${reason}` : ''}.`,
      payload: { contract_id: String(contract._id), kind: 'monthly_contract' },
    });

    // A85: Socket event cập nhật tức thì khi kết thúc hợp đồng
    const endPayload = { contract_id: String(contract._id), status: 'ended', reason };
    this.gateway.emitToUser(contract.customer_id.toString(), 'contract:ended', endPayload);
    this.gateway.emitToUser(contract.helper_id.toString(), 'contract:ended', endPayload);

    return this.populate(contract);
  }

  // ─── Điểm danh ────────────────────────────────────────────────────────────

  async checkin(helperId: string, id: string, dto?: { lat?: number; lng?: number }) {
    const contract = await this.getContractOrFail(id);
    if (contract.helper_id.toString() !== helperId) {
      throw new ForbiddenException('Chỉ thợ của hợp đồng mới điểm danh được');
    }
    if (contract.status !== 'active') {
      throw new ConflictException('Hợp đồng chưa có hiệu lực hoặc đã kết thúc');
    }

    // P1-17: Kiểm tra giờ hiện tại có nằm trong ca làm việc không theo giờ Việt Nam (+07:00) (cho phép lệch ±30 phút)
    if (contract.schedule?.time_start && contract.schedule?.time_end) {
      const vnNow = this.toVnDate(new Date());
      const currentMinutes = vnNow.getUTCHours() * 60 + vnNow.getUTCMinutes();
      const [startH, startM] = contract.schedule.time_start.split(':').map(Number);
      const [endH, endM] = contract.schedule.time_end.split(':').map(Number);
      const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
      const endMinutes = (endH ?? 0) * 60 + (endM ?? 0);
      if (currentMinutes < startMinutes - 30 || currentMinutes > endMinutes + 30) {
        throw new BadRequestException(
          `Hiện không trong ca làm việc (${contract.schedule.time_start} - ${contract.schedule.time_end}). Vui lòng điểm danh đúng giờ.`,
        );
      }
    }

    // A38: Kiểm tra GPS vị trí nếu client gửi tọa độ
    if (
      dto?.lat !== undefined &&
      dto?.lng !== undefined &&
      contract.address?.location?.coordinates &&
      contract.address.location.coordinates.length === 2
    ) {
      const [destLng, destLat] = contract.address.location.coordinates;
      const R = 6371; // km
      const dLat = ((destLat - dto.lat) * Math.PI) / 180;
      const dLon = ((destLng - dto.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((dto.lat * Math.PI) / 180) *
          Math.cos((destLat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (distanceKm > 2.0) {
        throw new BadRequestException(
          `Vị trí điểm danh cách xa địa chỉ làm việc (${distanceKm.toFixed(1)} km > 2 km). Vui lòng điểm danh tại nơi làm việc.`,
        );
      }
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
      type: NOTIFICATION_TYPES.MONTHLY_CONTRACT_CHECKIN,
      title: '🟢 Thợ đã điểm danh hôm nay',
      body: `Thợ của hợp đồng "${contract.title}" đã điểm danh ngày ${today}. Vui lòng xác nhận buổi làm.`,
      payload: { contract_id: String(contract._id), date: today, kind: 'monthly_contract' },
    });

    // A85: Socket event cập nhật tức thì điểm danh
    const checkinPayload = { contract_id: String(contract._id), date: today, status: 'checked_in' };
    this.gateway.emitToUser(contract.customer_id.toString(), 'contract:checked_in', checkinPayload);
    this.gateway.emitToUser(contract.helper_id.toString(), 'contract:checked_in', checkinPayload);

    return record;
  }

  async getAttendance(userId: string, id: string, month?: string, userRoles: string[] = []) {
    const contract = await this.getContractOrFail(id);
    this.assertParticipant(contract, userId, userRoles);
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
      type: NOTIFICATION_TYPES.MONTHLY_CONTRACT_ATTENDANCE,
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
      type: NOTIFICATION_TYPES.MONTHLY_CONTRACT_LEAVE_REQUEST,
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
    // B51: Ngày đã chấm công thì không duyệt nghỉ được — thợ có thể đã check-in
    // sau khi gửi đơn xin nghỉ (trước khi khách duyệt). Kiểm tra trước khi
    // tạo bản ghi 'leave' để không ghi đè buổi đã làm thành buổi nghỉ.
    if (approve) {
      const attendance = await this.attendanceModel
        .findOne({ contract_id: contract._id, date: leave.date })
        .exec();
      if (attendance && (attendance.status === 'checked_in' || attendance.status === 'confirmed')) {
        throw new BadRequestException(
          `Ngày ${leave.date} thợ đã chấm công, không thể duyệt nghỉ phép`,
        );
      }
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
      type: NOTIFICATION_TYPES.MONTHLY_CONTRACT_LEAVE_RESPONSE,
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

  fullMonthScheduledDates(contract: MonthlyContractDocument, month: string): string[] {
    const [y, m] = month.split('-').map(Number);
    const monthStart = new Date(y, (m ?? 1) - 1, 1);
    const monthEnd = new Date(y, m ?? 1, 0);
    const days = new Set(contract.schedule?.days_of_week ?? []);
    const result: string[] = [];
    const cursor = new Date(monthStart);
    while (cursor <= monthEnd) {
      if (days.has(cursor.getDay())) result.push(this.toDateStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

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
      // B50: Buổi đã chấm công thực tế ('checked_in') tính như buổi đã làm,
      // kể cả khi khách chưa kịp bấm xác nhận — lương tính theo buổi làm thật,
      // không phải buổi dự kiến. Chỉ 'confirmed' thì lương đã thiếu khi khách
      // chưa xác nhận kịp lúc chốt lương.
      if (st === 'confirmed' || st === 'checked_in') confirmed += 1;
      else if (st === 'leave') leave += 1;
      else if (st === 'absent') absent += 1;
      else if (!st && date < today) absent += 1; // quá khứ không có record = vắng
      // Ngày hôm nay/tương lai chưa có record: chưa tính
    }

    // A39: Tính lương theo tỷ lệ số buổi đã xác nhận / tổng số buổi theo lịch trọn tháng
    const fullMonthScheduled = this.fullMonthScheduledDates(contract, month);
    const totalScheduledDaysInMonth =
      fullMonthScheduled.length > 0 ? fullMonthScheduled.length : scheduled.length;
    const gross =
      totalScheduledDaysInMonth > 0
        ? Math.round((contract.monthly_salary * confirmed) / totalScheduledDaysInMonth)
        : 0;
    const fee = Math.round(
      (gross * (contract.platform_fee_percent ?? DEFAULT_MONTHLY_PLATFORM_FEE_PERCENT)) / 100,
    );
    return {
      contract_id: String(contract._id),
      month,
      scheduled_days: scheduled.length,
      confirmed_days: confirmed,
      leave_days: leave,
      absent_days: absent,
      gross_amount: gross,
      platform_fee: fee,
      helper_receives: gross - fee,
      status: 'preview',
    };
  }

  async getSettlement(userId: string, id: string, month?: string, userRoles: string[] = []) {
    const contract = await this.getContractOrFail(id);
    this.assertParticipant(contract, userId, userRoles);
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

    const isCashDirect = dto.payment_mode === 'cash_direct';

    // P0-1 + QUY TẮC ĐÃ QUYẾT 1: Chốt lương tháng chỉ cộng ví thợ SAU KHI đã
    // trừ ví khách; ví khách không đủ thì chặn chốt lương + báo nạp thêm.
    // Ngoại lệ duy nhất: chế độ "trả ngoài hệ thống" (cash_direct) thì chỉ ghi
    // nhận công, cộng 0₫ vào ví thợ.
    if (!isCashDirect && summary.gross_amount > 0) {
      const customerWallet =
        typeof this.paymentsService?.getWallet === 'function'
          ? await this.paymentsService.getWallet(customerId)
          : null;
      const realBalance = customerWallet?.balance ?? 0;
      if (realBalance < summary.gross_amount) {
        const shortage = summary.gross_amount - realBalance;
        throw new BadRequestException(
          `Số dư ví thật không đủ để chốt lương tháng ${dto.month}. Cần ${summary.gross_amount.toLocaleString('vi-VN')}₫ (hiện có ${realBalance.toLocaleString('vi-VN')}₫, cần nạp thêm ${shortage.toLocaleString('vi-VN')}₫). Vui lòng nạp thêm tiền vào ví trước khi chốt lương.`,
        );
      }
    }

    // F20: bọc toàn bộ chốt lương trong MongoDB transaction — tạo bản ghi
    // chốt lương + cộng tiền vào ví thợ cùng commit hoặc cùng rollback.
    // Không còn cộng tiền trước rồi rollback tay bằng deductWallet (lỗi
    // rollback từng bị nuốt im lặng, tiền đã cộng mà không có record).
    // Index unique (contract_id, month) chặn chốt trùng 2 lần.
    const conn = this.settlementModel.db;
    let session: any = null;
    try {
      session = await conn.startSession();
    } catch (sErr) {
      this.logger.warn(`Could not start mongoose session for settle: ${sErr}`);
    }

    const doSettle = async (sess: any): Promise<MonthlySettlementDocument> => {
      // 1. Trừ ví khách nếu thanh toán qua hệ thống
      if (!isCashDirect && summary.gross_amount > 0) {
        await this.paymentsService.deductWallet(
          customerId,
          summary.gross_amount,
          `Thanh toán lương tháng ${dto.month} — hợp đồng "${contract.title}" (${summary.confirmed_days}/${summary.scheduled_days} buổi)`,
          sess,
        );
      }

      // 2. Tạo bản ghi chốt lương
      const [settlement] = await this.settlementModel.create(
        [
          {
            contract_id: contract._id,
            month: dto.month,
            scheduled_days: summary.scheduled_days,
            confirmed_days: summary.confirmed_days,
            leave_days: summary.leave_days,
            absent_days: summary.absent_days,
            gross_amount: summary.gross_amount,
            platform_fee: summary.platform_fee,
            helper_receives: isCashDirect ? 0 : summary.helper_receives,
            status: 'settled',
            settled_at: new Date(),
            settled_by: new Types.ObjectId(customerId),
          },
        ],
        { session: sess ?? undefined },
      );

      // 3. Cộng ví thợ nếu thanh toán qua hệ thống
      if (!isCashDirect && summary.helper_receives > 0) {
        await this.paymentsService.creditWallet(
          contract.helper_id.toString(),
          summary.helper_receives,
          {
            description: `Lương tháng ${dto.month} — hợp đồng "${contract.title}" (${summary.confirmed_days}/${summary.scheduled_days} buổi, đã trừ phí sàn ${contract.platform_fee_percent ?? DEFAULT_MONTHLY_PLATFORM_FEE_PERCENT}%)`,
            reference: `MONTHLY-${String(contract._id).slice(-6)}-${dto.month}`,
            type: 'earning',
          },
          sess,
        );
      }
      return settlement;
    };

    let settlement!: MonthlySettlementDocument;
    try {
      if (session) {
        try {
          await session.withTransaction(async () => {
            settlement = await doSettle(session);
          });
        } catch (txErr: any) {
          if (
            txErr?.message?.includes('replica set member') ||
            txErr?.message?.includes('Transaction numbers')
          ) {
            // Môi trường không hỗ trợ transaction (standalone MongoDB):
            // chạy không transaction, index unique vẫn chặn chốt trùng.
            settlement = await doSettle(undefined);
          } else {
            throw txErr;
          }
        }
      } else {
        settlement = await doSettle(undefined);
      }
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException(`Tháng ${dto.month} đã được chốt lương rồi`);
      }
      this.logger.error(`Settle ${dto.month} for contract ${id} failed: ${err?.message ?? err}`);
      throw err;
    } finally {
      if (session) {
        await session.endSession().catch(() => undefined);
      }
    }

    // B100: chốt lương xong → báo cả thợ (đã có) và khách
    await this.notificationsService.create({
      userId: contract.helper_id.toString(),
      type: NOTIFICATION_TYPES.MONTHLY_CONTRACT_SETTLED,
      title: '💰 Đã chốt lương tháng ' + dto.month,
      body: `Hợp đồng "${contract.title}": ${summary.confirmed_days}/${summary.scheduled_days} buổi — bạn nhận ${summary.helper_receives.toLocaleString('vi-VN')}₫ vào ví.`,
      payload: { contract_id: String(contract._id), month: dto.month, kind: 'monthly_contract' },
    });
    await this.notificationsService
      .create({
        userId: contract.customer_id.toString(),
        type: 'monthly_contract_settled',
        title: '💰 Đã chốt lương tháng ' + dto.month,
        body: `Hợp đồng "${contract.title}": đã chốt lương tháng ${dto.month} — thợ nhận ${summary.helper_receives.toLocaleString('vi-VN')}₫ (${summary.confirmed_days}/${summary.scheduled_days} buổi).`,
        payload: { contract_id: String(contract._id), month: dto.month, kind: 'monthly_contract' },
      })
      .catch(() => undefined);

    // A85: Socket event cập nhật tức thì chốt lương
    const settlePayload = {
      contract_id: String(contract._id),
      month: dto.month,
      status: 'settled',
    };
    this.gateway.emitToUser(customerId, 'contract:settled', settlePayload);
    this.gateway.emitToUser(contract.helper_id.toString(), 'contract:settled', settlePayload);

    return {
      ...summary,
      status: 'settled' as const,
      settled_at: settlement.settled_at,
      settlement_id: String(settlement._id),
    };
  }

  /**
   * B100: nhắc 3 mốc hợp đồng tháng cho CẢ khách + thợ, mỗi mốc 1 lần:
   *  - bắt đầu (start_date là hôm nay, status active)
   *  - sắp hết hạn (end_date trong 3 ngày tới, status active)
   *  - chốt lương xong (gửi ngay trong settle(), xem trên)
   * Hợp đồng đã huỷ/kết thúc/từ chối thì không nhắc.
   */
  // T6: Chạy lúc 08:00 sáng theo giờ Việt Nam
  @Cron('0 8 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async notifyMonthlyContractMilestones(): Promise<void> {
    const now = new Date();
    const todayKey = this.todayStr();
    const todayStart = new Date(`${todayKey}T00:00:00+07:00`);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const in3Days = new Date(todayStart.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Mốc bắt đầu
    const starting = await this.contractModel
      .find({
        status: 'active',
        start_date: { $gte: todayStart, $lt: todayEnd },
        start_notified_at: null,
      })
      .exec();
    for (const c of starting) {
      const claimed = await this.contractModel
        .findOneAndUpdate(
          { _id: c._id, start_notified_at: null },
          { $set: { start_notified_at: now } },
          { new: true },
        )
        .exec();
      if (!claimed) continue;
      for (const userId of [String(c.customer_id), String(c.helper_id)]) {
        await this.notificationsService
          .create({
            userId,
            type: NOTIFICATION_TYPES.MONTHLY_CONTRACT_STARTED,
            title: 'Hợp đồng tháng đã bắt đầu',
            body: `Hợp đồng "${c.title}" đã bắt đầu hôm nay.`,
            payload: { contract_id: String(c._id), kind: 'monthly_contract' },
          })
          .catch(() => undefined);
      }
    }

    // Mốc sắp hết hạn (3 ngày trước)
    const expiring = await this.contractModel
      .find({
        status: 'active',
        end_date: { $gte: todayStart, $lt: in3Days },
        expiry_notified_at: null,
      })
      .exec();
    for (const c of expiring) {
      const claimed = await this.contractModel
        .findOneAndUpdate(
          { _id: c._id, expiry_notified_at: null },
          { $set: { expiry_notified_at: now } },
          { new: true },
        )
        .exec();
      if (!claimed) continue;
      for (const userId of [String(c.customer_id), String(c.helper_id)]) {
        await this.notificationsService
          .create({
            userId,
            type: NOTIFICATION_TYPES.MONTHLY_CONTRACT_EXPIRING_SOON,
            title: 'Hợp đồng tháng sắp hết hạn',
            body: `Hợp đồng "${c.title}" sắp hết hạn vào ${this.toDateStr(new Date(c.end_date!))}.`,
            payload: { contract_id: String(c._id), kind: 'monthly_contract' },
          })
          .catch(() => undefined);
      }
    }
  }

  // ─── Admin Management ───────────────────────────────────────────────────────

  // ─── Admin can thiệp (B3) ─────────────────────────────────────────────────

  /** Admin duyệt hợp đồng đang chờ (tương đương thợ đồng ý). */
  async adminApprove(id: string) {
    const contract = await this.getContractOrFail(id);
    if (contract.status !== 'pending') {
      throw new ConflictException('Chỉ hợp đồng đang chờ duyệt mới duyệt được');
    }
    contract.status = 'active';
    contract.responded_at = new Date();
    await contract.save();
    await this.notifyBoth(
      contract,
      NOTIFICATION_TYPES.MONTHLY_CONTRACT_ACCEPTED,
      'Hợp đồng theo tháng đã được duyệt',
      `Hợp đồng "${contract.title}" đã được Admin duyệt và có hiệu lực.`,
    );
    return this.populate(contract);
  }

  /** Admin hủy hợp đồng đang chờ hoặc đang hiệu lực. */
  async adminCancel(id: string, reason?: string) {
    const contract = await this.getContractOrFail(id);
    if (contract.status !== 'pending' && contract.status !== 'active') {
      throw new ConflictException('Hợp đồng này không thể hủy ở trạng thái hiện tại');
    }
    contract.status = 'cancelled';
    contract.ended_at = new Date();
    contract.end_reason = reason || 'Đã hủy bởi Quản trị viên';
    await contract.save();
    await this.notifyBoth(
      contract,
      NOTIFICATION_TYPES.MONTHLY_CONTRACT_CANCELLED,
      'Hợp đồng theo tháng đã bị hủy',
      `Hợp đồng "${contract.title}" đã bị Admin hủy${reason ? `: ${reason}` : '.'}`,
    );
    return this.populate(contract);
  }

  /** Admin kết thúc hợp đồng đang hiệu lực. */
  async adminEnd(id: string, reason?: string) {
    const contract = await this.getContractOrFail(id);
    if (contract.status !== 'active') {
      throw new ConflictException('Chỉ hợp đồng đang hiệu lực mới kết thúc được');
    }
    contract.status = 'ended';
    contract.ended_at = new Date();
    contract.end_date = new Date();
    contract.end_reason = reason;
    await contract.save();
    await this.notifyBoth(
      contract,
      NOTIFICATION_TYPES.MONTHLY_CONTRACT_ENDED,
      'Hợp đồng theo tháng đã kết thúc',
      `Hợp đồng "${contract.title}" đã được Admin kết thúc${reason ? `: ${reason}` : '.'}`,
    );
    return this.populate(contract);
  }

  private async notifyBoth(contract: any, type: string, title: string, body: string) {
    for (const userId of [contract.customer_id, contract.helper_id]) {
      if (!userId) continue;
      await this.notificationsService
        .create({
          userId: String(userId._id ?? userId),
          type,
          title,
          body,
          payload: { contract_id: String(contract._id), kind: 'monthly_contract' },
        })
        .catch(() => undefined);
    }
  }

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
