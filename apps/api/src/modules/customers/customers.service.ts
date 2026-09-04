import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerProfile, CustomerProfileDocument } from './schemas/customer-profile.schema';
import { CreateAddressDto } from './dto/address.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(CustomerProfile.name)
    private customerModel: Model<CustomerProfileDocument>,
  ) {}

  async getOrCreate(userId: string): Promise<CustomerProfileDocument> {
    const profile = await this.customerModel
      .findOneAndUpdate(
        { user_id: new Types.ObjectId(userId) },
        { $setOnInsert: { user_id: new Types.ObjectId(userId) } },
        { upsert: true, new: true },
      )
      .exec();
    return profile!;
  }

  async getProfile(userId: string): Promise<CustomerProfileDocument> {
    return this.getOrCreate(userId);
  }

  // ─── Addresses ────────────────────────────────────────────────────────────

  async addAddress(userId: string, dto: CreateAddressDto) {
    const profile = await this.getOrCreate(userId);

    if (profile.addresses.length >= 10) {
      throw new BadRequestException('Tối đa 10 địa chỉ');
    }

    // If this is marked as default, remove default from others
    if (dto.is_default) {
      profile.addresses.forEach(a => {
        a.is_default = false;
      });
    }

    // If no addresses yet, make this default
    const isDefault = dto.is_default ?? profile.addresses.length === 0;

    profile.addresses.push({
      label: dto.label,
      full_address: dto.full_address,
      street: dto.street,
      ward: dto.ward,
      district: dto.district,
      city: dto.city,
      location: { type: 'Point', coordinates: dto.location.coordinates },
      is_default: isDefault,
      notes: dto.notes,
    });

    await profile.save();
    return profile;
  }

  async updateAddress(userId: string, addressIndex: number, dto: CreateAddressDto) {
    const profile = await this.getOrCreate(userId);

    if (addressIndex < 0 || addressIndex >= profile.addresses.length) {
      throw new NotFoundException('Địa chỉ không tồn tại');
    }

    if (dto.is_default) {
      profile.addresses.forEach(a => {
        a.is_default = false;
      });
    }

    Object.assign(profile.addresses[addressIndex], {
      ...dto,
      location: { type: 'Point', coordinates: dto.location.coordinates },
    });

    await profile.save();
    return profile;
  }

  async deleteAddress(userId: string, addressIndex: number) {
    const profile = await this.getOrCreate(userId);

    if (addressIndex < 0 || addressIndex >= profile.addresses.length) {
      throw new NotFoundException('Địa chỉ không tồn tại');
    }

    const wasDefault = profile.addresses[addressIndex].is_default;
    profile.addresses.splice(addressIndex, 1);

    // Make first remaining address default if we deleted the default
    if (wasDefault && profile.addresses.length > 0) {
      profile.addresses[0].is_default = true;
    }

    await profile.save();
    return profile;
  }

  async setDefaultAddress(userId: string, addressIndex: number) {
    const profile = await this.getOrCreate(userId);
    if (addressIndex < 0 || addressIndex >= profile.addresses.length) {
      throw new NotFoundException('Địa chỉ không tồn tại');
    }
    profile.addresses.forEach((a, i) => {
      a.is_default = i === addressIndex;
    });
    await profile.save();
    return profile;
  }
}
