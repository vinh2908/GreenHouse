import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HelperProfile, HelperProfileDocument } from './schemas/helper-profile.schema';
import {
  UpdateHelperProfileDto,
  SetHelperStatusDto,
  SubmitKycDto,
  UpdateLocationDto,
  BankAccountDto,
} from './dto/helper.dto';
import { HelperStatus, VerificationStatus } from '@homemate/types';
import { AppGateway } from '../chat/app.gateway';

@Injectable()
export class HelpersService {
  constructor(
    @InjectModel(HelperProfile.name)
    private helperModel: Model<HelperProfileDocument>,
    private readonly gateway: AppGateway,
  ) {}

  async getOrCreate(userId: string): Promise<HelperProfileDocument> {
    const profile = await this.helperModel
      .findOneAndUpdate(
        { user_id: new Types.ObjectId(userId) },
        { $setOnInsert: { user_id: new Types.ObjectId(userId) } },
        { upsert: true, new: true },
      )
      .exec();
    return profile!;
  }

  async getProfile(userId: string): Promise<HelperProfileDocument> {
    return this.getOrCreate(userId);
  }

  async getPublicProfile(idOrUserId: string): Promise<HelperProfileDocument> {
    const query = Types.ObjectId.isValid(idOrUserId)
      ? {
          $or: [
            { user_id: new Types.ObjectId(idOrUserId) },
            { _id: new Types.ObjectId(idOrUserId) },
          ],
        }
      : { user_id: idOrUserId };

    // Public view: never expose KYC documents, bank details or the helper's phone.
    const profile = await this.helperModel
      .findOne(query)
      .select(
        '-id_card_number -id_card_front -id_card_back -selfie_photo -bank_account -rejection_reason',
      )
      .populate('user_id', 'full_name avatar created_at')
      .populate('service_ids', 'name slug icon base_price_min base_price_max')
      .exec();

    if (!profile) throw new NotFoundException('Helper không tồn tại');
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateHelperProfileDto): Promise<HelperProfileDocument> {
    const profile = await this.getOrCreate(userId);
    Object.assign(profile, dto);
    if (dto.service_ids) {
      profile.service_ids = dto.service_ids.map(id => new Types.ObjectId(id)) as any;
    }
    return profile.save();
  }

  async setStatus(userId: string, dto: SetHelperStatusDto): Promise<HelperProfileDocument> {
    const profile = await this.getOrCreate(userId);

    // Can't go ONLINE if not verified
    if (
      dto.status === HelperStatus.ONLINE &&
      profile.verification_status !== VerificationStatus.APPROVED
    ) {
      throw new BadRequestException('Tài khoản chưa được xác minh. Vui lòng hoàn thành KYC trước.');
    }

    // Can't change status if BUSY (actively working)
    if (profile.status === HelperStatus.BUSY) {
      throw new BadRequestException('Đang thực hiện công việc, không thể thay đổi trạng thái.');
    }

    profile.status = dto.status;
    await profile.save();

    // Realtime: broadcast helper availability change to personal room
    this.gateway.emitToUser(userId, 'helper:status_changed', {
      helper_id: userId,
      status: dto.status,
    });

    return profile;
  }

  async submitKyc(userId: string, dto: SubmitKycDto): Promise<HelperProfileDocument> {
    const profile = await this.getOrCreate(userId);

    if (profile.verification_status === VerificationStatus.APPROVED) {
      throw new ConflictException('Tài khoản đã được xác minh.');
    }

    Object.assign(profile, {
      id_card_number: dto.id_card_number,
      id_card_front: dto.id_card_front,
      id_card_back: dto.id_card_back,
      selfie_photo: dto.selfie_photo,
      verification_status: VerificationStatus.PENDING,
      rejection_reason: undefined,
    });

    return profile.save();
  }

  async updateLocation(userId: string, dto: UpdateLocationDto): Promise<void> {
    await this.helperModel
      .findOneAndUpdate(
        { user_id: userId },
        {
          location: { type: 'Point', coordinates: dto.coordinates },
          last_location_update: new Date(),
        },
      )
      .exec();
  }

  async updateBankAccount(userId: string, dto: BankAccountDto): Promise<HelperProfileDocument> {
    const profile = await this.getOrCreate(userId);
    profile.bank_account = dto;
    return profile.save();
  }

  // ─── Admin: verify / reject KYC ──────────────────────────────────────────

  async approveKyc(userId: string): Promise<HelperProfileDocument> {
    const profile = await this.helperModel.findOne({ user_id: userId }).exec();
    if (!profile) throw new NotFoundException('Helper không tồn tại');
    if (profile.verification_status !== VerificationStatus.PENDING) {
      throw new BadRequestException('Hồ sơ không ở trạng thái chờ duyệt');
    }
    profile.verification_status = VerificationStatus.APPROVED;
    profile.verified_at = new Date();
    return profile.save();
  }

  async rejectKyc(userId: string, reason: string): Promise<HelperProfileDocument> {
    const profile = await this.helperModel.findOne({ user_id: userId }).exec();
    if (!profile) throw new NotFoundException('Helper không tồn tại');
    profile.verification_status = VerificationStatus.REJECTED;
    profile.rejection_reason = reason;
    return profile.save();
  }

  // ─── Find nearby helpers ──────────────────────────────────────────────────

  async findNearby(
    coordinates: [number, number],
    radiusKm: number,
    serviceId?: string,
  ): Promise<HelperProfileDocument[]> {
    const query: Record<string, unknown> = {
      status: HelperStatus.ONLINE,
      verification_status: VerificationStatus.APPROVED,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates },
          $maxDistance: radiusKm * 1000,
        },
      },
    };
    if (serviceId) {
      query['service_ids'] = new Types.ObjectId(serviceId);
    }
    return this.helperModel.find(query).limit(50).exec();
  }
}
