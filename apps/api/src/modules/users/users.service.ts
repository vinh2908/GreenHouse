import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from '@homemate/types';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user || user.is_deleted) throw new NotFoundException('User not found');
    return user;
  }

  async findByIdWithPassword(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('+password_hash').exec();
  }

  async findByPhone(phone: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ phone, is_deleted: false }).exec();
  }

  async findByPhoneWithPassword(phone: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ phone, is_deleted: false }).select('+password_hash').exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase(), is_deleted: false }).exec();
  }

  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase(), is_deleted: false })
      .select('+password_hash')
      .exec();
  }

  async create(data: {
    phone: string;
    full_name: string;
    password_hash: string;
    email?: string;
  }): Promise<UserDocument> {
    const existing = await this.findByPhone(data.phone);
    if (existing) throw new ConflictException('Số điện thoại đã được đăng ký');

    if (data.email) {
      const existingEmail = await this.findByEmail(data.email);
      if (existingEmail) throw new ConflictException('Email đã được đăng ký');
    }

    const user = new this.userModel({
      ...data,
      roles: [UserRole.CUSTOMER],
      active_role: UserRole.CUSTOMER,
      is_verified: false, // A103: Bắt buộc xác minh email trước khi tạo đơn/nhận việc
    });
    return user.save();
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    // B95: đổi email KHÔNG được đi qua update profile thường — phải xác minh
    // email mới bằng mã OTP trước (POST /auth/email/change-request + /change-confirm)
    if (dto.email) {
      const current = await this.userModel.findById(id).select('email').exec();
      if (!current) throw new NotFoundException('User not found');
      if (dto.email.trim().toLowerCase() !== (current.email ?? '').toLowerCase()) {
        throw new BadRequestException(
          'Đổi email cần xác minh email mới: gửi mã xác nhận tới email mới rồi nhập mã để đổi.',
        );
      }
      delete (dto as any).email; // trùng email cũ thì không cần ghi lại
    }
    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** B95: đổi email sau khi đã xác minh mã OTP gửi tới email mới. */
  async changeEmail(id: string, newEmail: string): Promise<UserDocument> {
    const email = newEmail.trim().toLowerCase();
    const taken = await this.findByEmail(email);
    if (taken && String(taken._id) !== String(id)) {
      throw new ConflictException('Email đã được đăng ký');
    }
    const user = await this.userModel
      .findByIdAndUpdate(id, { email, is_verified: true }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async addRole(id: string, role: UserRole): Promise<UserDocument> {
    const user = await this.findById(id);
    if (!user.roles.includes(role)) {
      user.roles.push(role);
      await user.save();
    }
    return user;
  }

  async switchRole(id: string, role: UserRole): Promise<UserDocument> {
    const user = await this.findById(id);
    if (!user.roles.includes(role)) {
      user.roles.push(role);
    }
    user.active_role = role;
    return user.save();
  }

  async markVerified(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { is_verified: true }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { password_hash: passwordHash }).exec();
  }

  async updateFcmToken(id: string, fcmToken: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { fcm_token: fcmToken }).exec();
  }

  /** Lưu Expo push token của 1 thiết bị (không trùng lặp). */
  async addPushToken(id: string, token: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { $addToSet: { push_tokens: token } }).exec();
  }

  /** Gỡ Expo push token khi đăng xuất / tắt thông báo trên thiết bị. */
  async removePushToken(id: string, token: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { $pull: { push_tokens: token } }).exec();
  }

  /**
   * Lưu VoIP token của thiết bị (đánh thức cuộc gọi đến khi app chạy nền /
   * bị đóng hẳn). Token là duy nhất trong danh sách — đăng ký lại cùng token
   * thì cập nhật platform + thời gian (pull trước, push sau).
   */
  async addVoipToken(id: string, token: string, platform: 'ios' | 'android'): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { $pull: { voip_tokens: { token } } }).exec();
    await this.userModel
      .findByIdAndUpdate(id, {
        $push: { voip_tokens: { token, platform, updated_at: new Date() } },
      })
      .exec();
  }

  /** Gỡ VoIP token khi đăng xuất. */
  async removeVoipToken(id: string, token: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { $pull: { voip_tokens: { token } } }).exec();
  }

  /** Lưu refresh token đang hoạt động */
  async addRefreshToken(id: string, token: string): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(id, {
        $push: {
          tokens: {
            $each: [token],
            $slice: -20,
          },
        },
      })
      .exec();
  }

  /** Thu hồi 1 refresh token và ghi nhận vào invalid_tokens */
  async revokeRefreshToken(id: string, token: string): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(id, {
        $pull: { tokens: token },
        $push: {
          invalid_tokens: {
            $each: [token],
            $slice: -50,
          },
        },
      })
      .exec();
  }

  /** Thu hồi toàn bộ refresh token (đăng xuất mọi thiết bị) */
  async revokeAllRefreshTokens(id: string): Promise<void> {
    const user = await this.userModel.findById(id).select('tokens').exec();
    const existingTokens = user?.tokens ?? [];
    await this.userModel
      .findByIdAndUpdate(id, {
        $set: { tokens: [] },
        $inc: { token_version: 1 },
        $push: {
          invalid_tokens: {
            $each: existingTokens,
            $slice: -50,
          },
        },
      })
      .exec();
  }

  /** Tăng token_version khi đăng xuất để vô hiệu hóa access token cũ ngay lập tức */
  async incrementTokenVersion(id: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { $inc: { token_version: 1 } }).exec();
  }
}
