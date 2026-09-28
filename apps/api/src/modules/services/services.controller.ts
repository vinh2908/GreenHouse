import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import {
  CreateServiceDto,
  CreateServiceCategoryDto,
  UpdateServiceDto,
  UpdateServiceStatusDto,
} from './dto/service.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '@homemate/types';

@ApiTags('Services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  // ─── Public endpoints ─────────────────────────────────────────────────────

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Lấy danh sách danh mục dịch vụ' })
  async getCategories() {
    return this.servicesService.getAllCategories();
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách dịch vụ' })
  @ApiQuery({ name: 'category_id', required: false })
  @ApiQuery({ name: 'include_inactive', required: false, type: Boolean })
  async getAll(
    @Query('category_id') categoryId?: string,
    @Query('include_inactive') includeInactive?: string,
  ) {
    return this.servicesService.getAll(categoryId, includeInactive === 'true');
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết dịch vụ theo ID' })
  async getById(@Param('id') id: string) {
    return this.servicesService.getById(id);
  }

  // ─── Admin endpoints ──────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('categories')
  @ApiOperation({ summary: '[Admin] Tạo danh mục dịch vụ' })
  async createCategory(@Body() dto: CreateServiceCategoryDto) {
    return this.servicesService.createCategory(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: '[Admin] Tạo dịch vụ mới' })
  async create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put(':id')
  @ApiOperation({ summary: '[Admin] Cập nhật dịch vụ' })
  async update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Bật/tắt dịch vụ' })
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateServiceStatusDto) {
    return this.servicesService.updateStatus(id, dto.status);
  }
}
