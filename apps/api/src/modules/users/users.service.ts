import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
      is_verified: true, // Kích hoạt ngay khi tạo tài khoản
    });
    return user.save();
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true })
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
}
