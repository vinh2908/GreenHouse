import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FavoriteHelper, FavoriteHelperDocument } from './schemas/favorite.schema';
import { HelperProfile, HelperProfileDocument } from '../helpers/schemas/helper-profile.schema';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { JobStatus, VerificationStatus } from '@homemate/types';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectModel(FavoriteHelper.name)
    private favoriteModel: Model<FavoriteHelperDocument>,
    @InjectModel(HelperProfile.name)
    private helperModel: Model<HelperProfileDocument>,
    @InjectModel(Job.name)
    private jobModel: Model<JobDocument>,
  ) {}

  async isFavorite(customerId: string, helperId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(helperId)) return false;
    const found = await this.favoriteModel
      .exists({
        customer_id: new Types.ObjectId(customerId),
        helper_id: new Types.ObjectId(helperId),
      })
      .exec();
    return !!found;
  }

  // ─── List favorites (kèm thông tin thợ + thống kê) ─────────────────────────

  async listFavorites(customerId: string) {
    const favorites = await this.favoriteModel
      .find({ customer_id: new Types.ObjectId(customerId) })
      .populate('helper_id', 'full_name phone avatar')
      .sort({ created_at: -1 })
      .exec();

    const helperUserIds = favorites
      .map(f => {
        const h = f.helper_id as any;
        return h?._id ? h._id : h;
      })
      .filter(Boolean);

    const profiles = await this.helperModel
      .find({ user_id: { $in: helperUserIds } })
      .select(
        'user_id rating total_reviews completed_jobs years_experience verification_status status service_ids bio',
      )
      .lean()
      .exec();

    const profileMap = new Map(profiles.map(p => [String(p.user_id), p]));

    return Promise.all(
      favorites.map(async f => {
        const obj = f.toObject() as any;
        const hId = String(obj.helper_id?._id || obj.helper_id);
        const prof = profileMap.get(hId) ? { ...profileMap.get(hId) } : null;
        if (prof) {
          if (!prof.completed_jobs) {
            const count = await this.jobModel.countDocuments({
              helper_id: new Types.ObjectId(hId),
              status: JobStatus.COMPLETED,
            });
            prof.completed_jobs = count;
          }
          obj.helper_profile = prof;
        } else {
          obj.helper_profile = null;
        }
        return obj;
      }),
    );
  }

  // ─── Add favorite ──────────────────────────────────────────────────────────

  async addFavorite(customerId: string, helperId: string): Promise<FavoriteHelperDocument> {
    if (customerId === helperId) {
      throw new BadRequestException('Bạn không thể tự thêm chính mình vào danh sách yêu thích');
    }

    const profile = await this.helperModel
      .findOne({ user_id: new Types.ObjectId(helperId) })
      .exec();
    if (!profile) {
      throw new NotFoundException('Không tìm thấy hồ sơ thợ này');
    }
    if (profile.verification_status !== VerificationStatus.APPROVED) {
      throw new BadRequestException('Chỉ có thể yêu thích thợ đã được xác thực e-KYC');
    }

    const existing = await this.favoriteModel
      .findOne({
        customer_id: new Types.ObjectId(customerId),
        helper_id: new Types.ObjectId(helperId),
      })
      .exec();
    if (existing) throw new ConflictException('Thợ này đã có trong danh sách yêu thích');

    return this.favoriteModel.create({
      customer_id: new Types.ObjectId(customerId),
      helper_id: new Types.ObjectId(helperId),
    });
  }

  // ─── Remove favorite ───────────────────────────────────────────────────────

  async removeFavorite(customerId: string, helperId: string): Promise<void> {
    const deleted = await this.favoriteModel
      .findOneAndDelete({
        customer_id: new Types.ObjectId(customerId),
        helper_id: new Types.ObjectId(helperId),
      })
      .exec();
    if (!deleted) throw new NotFoundException('Thợ này không có trong danh sách yêu thích');
  }

  // ─── Job hoàn thành gần nhất với 1 thợ (nguồn cho "Đặt lại") ───────────────

  async getLastCompletedJobWithHelper(customerId: string, helperId: string) {
    const job = await this.jobModel
      .findOne({
        customer_id: new Types.ObjectId(customerId),
        helper_id: new Types.ObjectId(helperId),
        status: JobStatus.COMPLETED,
      })
      .populate('service_id', 'name slug icon')
      .sort({ updated_at: -1 })
      .exec();
    if (!job) {
      throw new NotFoundException('Bạn chưa có đơn hoàn thành nào với thợ này');
    }
    return job;
  }
}
