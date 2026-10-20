import {
  Module,
  Injectable,
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Prop, Schema, SchemaFactory, InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IsString, Length, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@homemate/types';

@Schema({ timestamps: true })
export class Feedback {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) user_id: Types.ObjectId;
  @Prop({ required: true }) message: string;
  @Prop({ enum: ['open', 'resolved'], default: 'open' }) status: string;
}
const FeedbackSchema = SchemaFactory.createForClass(Feedback);
class CreateFeedbackDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(10, 2000)
  message: string;
}
class UpdateFeedbackDto {
  @IsIn(['open', 'resolved']) status: string;
}

@Injectable()
export class FeedbackService {
  constructor(@InjectModel(Feedback.name) private readonly model: Model<Feedback>) {}
  create(userId: string, dto: CreateFeedbackDto) {
    return this.model.create({ user_id: new Types.ObjectId(userId), message: dto.message.trim() });
  }
  list(userId?: string) {
    return this.model
      .find(userId ? { user_id: new Types.ObjectId(userId) } : {})
      .populate('user_id', 'full_name')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();
  }
  async update(id: string, status: string) {
    const item = await this.model
      .findByIdAndUpdate(id, { status }, { new: true, runValidators: true })
      .exec();
    if (!item) throw new NotFoundException('Góp ý không tồn tại');
    return item;
  }
}
@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}
  @Post() create(@CurrentUser() user: { sub: string }, @Body() dto: CreateFeedbackDto) {
    return this.service.create(user.sub, dto);
  }
  @Get('my') mine(@CurrentUser() user: { sub: string }) {
    return this.service.list(user.sub);
  }
  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  all() {
    return this.service.list();
  }
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateFeedbackDto) {
    return this.service.update(id, dto.status);
  }
}
@Module({
  imports: [MongooseModule.forFeature([{ name: Feedback.name, schema: FeedbackSchema }])],
  controllers: [FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
