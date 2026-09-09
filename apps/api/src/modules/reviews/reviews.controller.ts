import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, HelperReplyDto } from './dto/review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@homemate/types';

@ApiTags('Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ─── Customer: Create review ───────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: '[Customer] Đánh giá công việc đã hoàn thành' })
  async createReview(
    @CurrentUser() user: { sub: string },
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(user.sub, dto.helper_id, dto);
  }

  // ─── Helper: Reply to review ───────────────────────────────────────────────

  @Patch(':id/reply')
  @ApiOperation({ summary: '[Helper] Phản hồi đánh giá' })
  async replyToReview(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: HelperReplyDto,
  ) {
    return this.reviewsService.replyToReview(user.sub, id, dto);
  }

  // ─── Get reviews for a helper (public) ────────────────────────────────────

  @Get('helpers/:helperId')
  @ApiOperation({ summary: 'Lấy danh sách đánh giá của một helper' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHelperReviews(
    @Param('helperId') helperId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewsService.getHelperReviews(helperId, Number(page) || 1, Number(limit) || 10);
  }

  // ─── Get rating stats for a helper ────────────────────────────────────────

  @Get('helpers/:helperId/stats')
  @ApiOperation({ summary: 'Thống kê rating của helper' })
  async getHelperStats(@Param('helperId') helperId: string) {
    return this.reviewsService.getHelperRatingStats(helperId);
  }

  // ─── Get review for a specific job ────────────────────────────────────────

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Lấy đánh giá của một công việc' })
  async getReviewByJob(@Param('jobId') jobId: string) {
    return this.reviewsService.getReviewByJob(jobId);
  }

  // ─── Customer: My reviews ─────────────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: '[Customer] Đánh giá tôi đã viết' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyReviews(
    @CurrentUser() user: { sub: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewsService.getCustomerReviews(
      user.sub,
      Number(page) || 1,
      Number(limit) || 10,
    );
  }

  // ─── Admin: All reviews ────────────────────────────────────────────────────

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Tất cả đánh giá trong hệ thống' })
  @ApiQuery({ name: 'min_rating', required: false, type: Number })
  @ApiQuery({ name: 'max_rating', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllReviews(
    @Query('min_rating') minRating?: number,
    @Query('max_rating') maxRating?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewsService.getAllReviews(
      minRating ? Number(minRating) : undefined,
      maxRating ? Number(maxRating) : undefined,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }
}
