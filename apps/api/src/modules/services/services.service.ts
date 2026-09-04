import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Service,
  ServiceDocument,
  ServiceCategory,
  ServiceCategoryDocument,
} from './schemas/service.schema';
import { CreateServiceDto, CreateServiceCategoryDto, UpdateServiceDto } from './dto/service.dto';
import { ServiceStatus } from '@homemate/types';

@Injectable()
export class ServicesService {
  constructor(
    @InjectModel(Service.name) private serviceModel: Model<ServiceDocument>,
    @InjectModel(ServiceCategory.name) private categoryModel: Model<ServiceCategoryDocument>,
  ) {}

  // ─── Categories ───────────────────────────────────────────────────────────

  async getAllCategories() {
    return this.categoryModel
      .find({ status: ServiceStatus.ACTIVE })
      .sort({ sort_order: 1, created_at: 1 })
      .exec();
  }

  async createCategory(dto: CreateServiceCategoryDto) {
    const existing = await this.categoryModel.findOne({ slug: dto.slug }).exec();
    if (existing) throw new ConflictException(`Slug '${dto.slug}' đã tồn tại`);
    return this.categoryModel.create(dto);
  }

  // ─── Services ─────────────────────────────────────────────────────────────

  async getAll(categoryId?: string) {
    const query: Record<string, unknown> = { status: ServiceStatus.ACTIVE };
    if (categoryId && categoryId !== 'undefined' && Types.ObjectId.isValid(categoryId)) {
      query['category_id'] = new Types.ObjectId(categoryId);
    }
    return this.serviceModel
      .find(query)
      .populate('category_id', 'name slug icon')
      .sort({ name: 1 })
      .exec();
  }

  async getById(id: string) {
    const service = await this.serviceModel
      .findById(id)
      .populate('category_id', 'name slug icon')
      .exec();
    if (!service) throw new NotFoundException('Dịch vụ không tồn tại');
    return service;
  }

  async getBySlug(slug: string) {
    const service = await this.serviceModel
      .findOne({ slug, status: ServiceStatus.ACTIVE })
      .populate('category_id', 'name slug icon')
      .exec();
    if (!service) throw new NotFoundException('Dịch vụ không tồn tại');
    return service;
  }

  async create(dto: CreateServiceDto) {
    const existing = await this.serviceModel.findOne({ slug: dto.slug }).exec();
    if (existing) throw new ConflictException(`Slug '${dto.slug}' đã tồn tại`);

    const category = await this.categoryModel.findById(dto.category_id).exec();
    if (!category) throw new NotFoundException('Danh mục không tồn tại');

    return this.serviceModel.create({
      ...dto,
      category_id: new Types.ObjectId(dto.category_id),
    });
  }

  async update(id: string, dto: UpdateServiceDto) {
    const service = await this.serviceModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true })
      .exec();
    if (!service) throw new NotFoundException('Dịch vụ không tồn tại');
    return service;
  }

  async updateStatus(id: string, status: ServiceStatus) {
    const service = await this.serviceModel.findByIdAndUpdate(id, { status }, { new: true }).exec();
    if (!service) throw new NotFoundException('Dịch vụ không tồn tại');
    return service;
  }

  // ─── Seeding ──────────────────────────────────────────────────────────────

  async seedDefaultServices() {
    const count = await this.categoryModel.countDocuments().exec();
    if (count > 0) return; // Already seeded

    const categories = await this.categoryModel.create([
      { name: 'Giúp việc theo giờ', slug: 'giup-viec-theo-gio', icon: 'clock', sort_order: 1 },
      { name: 'Giúp việc theo ngày', slug: 'giup-viec-theo-ngay', icon: 'calendar', sort_order: 2 },
      { name: 'Tổng vệ sinh nhà', slug: 'tong-ve-sinh-nha', icon: 'home', sort_order: 3 },
      { name: 'Giúp việc định kỳ', slug: 'giup-viec-dinh-ky', icon: 'repeat', sort_order: 4 },
      { name: 'Nấu ăn gia đình', slug: 'nau-an-gia-dinh', icon: 'chef-hat', sort_order: 5 },
    ]);

    await this.serviceModel.create([
      {
        category_id: categories[0]._id,
        name: 'Giúp việc theo giờ',
        slug: 'giup-viec-theo-gio',
        description: 'Thuê người giúp việc theo số giờ linh hoạt.',
        price_range_min: 50000,
        price_range_max: 120000,
        estimated_duration_min: 2,
        estimated_duration_max: 8,
        platform_fee_percent: 15,
        tags: ['giup-viec', 'theo-gio'],
      },
      {
        category_id: categories[1]._id,
        name: 'Giúp việc theo ngày',
        slug: 'giup-viec-theo-ngay',
        description: 'Thuê người giúp việc trọn ngày (8 tiếng).',
        price_range_min: 350000,
        price_range_max: 700000,
        estimated_duration_min: 8,
        estimated_duration_max: 10,
        platform_fee_percent: 15,
        tags: ['giup-viec', 'theo-ngay'],
      },
      {
        category_id: categories[2]._id,
        name: 'Tổng vệ sinh nhà',
        slug: 'tong-ve-sinh-nha',
        description: 'Vệ sinh toàn diện căn nhà.',
        price_range_min: 500000,
        price_range_max: 3000000,
        estimated_duration_min: 4,
        estimated_duration_max: 16,
        platform_fee_percent: 20,
        tags: ['ve-sinh', 'tong-ve-sinh'],
      },
      {
        category_id: categories[3]._id,
        name: 'Giúp việc định kỳ',
        slug: 'giup-viec-dinh-ky',
        description: 'Đặt lịch hàng tuần hoặc hàng tháng.',
        price_range_min: 40000,
        price_range_max: 100000,
        estimated_duration_min: 2,
        estimated_duration_max: 8,
        platform_fee_percent: 15,
        tags: ['dinh-ky', 'hang-tuan'],
      },
      {
        category_id: categories[4]._id,
        name: 'Nấu ăn gia đình',
        slug: 'nau-an-gia-dinh',
        description: 'Thuê người nấu bữa ăn tại nhà.',
        price_range_min: 80000,
        price_range_max: 200000,
        estimated_duration_min: 1,
        estimated_duration_max: 4,
        platform_fee_percent: 15,
        tags: ['nau-an', 'bep'],
      },
    ]);
  }
}
