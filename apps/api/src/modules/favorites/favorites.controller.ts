import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FavoritesService } from './favorites.service';
import { AddFavoriteDto } from './dto/favorite.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Favorites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers/me/favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: '[Customer] Danh sách thợ yêu thích' })
  async list(@CurrentUser() user: { sub: string }) {
    return this.favoritesService.listFavorites(user.sub);
  }

  @Post()
  @ApiOperation({ summary: '[Customer] Thêm thợ vào danh sách yêu thích' })
  async add(@CurrentUser() user: { sub: string }, @Body() dto: AddFavoriteDto) {
    return this.favoritesService.addFavorite(user.sub, dto.helper_id);
  }

  @Delete(':helperId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Customer] Bỏ thợ khỏi danh sách yêu thích' })
  async remove(@CurrentUser() user: { sub: string }, @Param('helperId') helperId: string) {
    await this.favoritesService.removeFavorite(user.sub, helperId);
  }

  @Get(':helperId/last-completed-job')
  @ApiOperation({ summary: '[Customer] Đơn hoàn thành gần nhất với thợ (để đặt lại)' })
  async lastCompleted(@CurrentUser() user: { sub: string }, @Param('helperId') helperId: string) {
    return this.favoritesService.getLastCompletedJobWithHelper(user.sub, helperId);
  }
}
