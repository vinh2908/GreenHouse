import {
  Controller, Get, Post, Put, Delete, Body, Param,
  UseGuards, ParseIntPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateAddressDto } from './dto/address.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('me/profile')
  @ApiOperation({ summary: 'Lấy hồ sơ customer của bản thân' })
  async getMyProfile(@CurrentUser() user: { sub: string }) {
    return this.customersService.getProfile(user.sub);
  }

  @Get('me/addresses')
  @ApiOperation({ summary: 'Lấy danh sách địa chỉ' })
  async getAddresses(@CurrentUser() user: { sub: string }) {
    const profile = await this.customersService.getProfile(user.sub);
    return profile.addresses;
  }

  @Post('me/addresses')
  @ApiOperation({ summary: 'Thêm địa chỉ mới' })
  async addAddress(@CurrentUser() user: { sub: string }, @Body() dto: CreateAddressDto) {
    return this.customersService.addAddress(user.sub, dto);
  }

  @Put('me/addresses/:index')
  @ApiOperation({ summary: 'Cập nhật địa chỉ theo index' })
  async updateAddress(
    @CurrentUser() user: { sub: string },
    @Param('index', ParseIntPipe) index: number,
    @Body() dto: CreateAddressDto,
  ) {
    return this.customersService.updateAddress(user.sub, index, dto);
  }

  @Delete('me/addresses/:index')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa địa chỉ theo index' })
  async deleteAddress(
    @CurrentUser() user: { sub: string },
    @Param('index', ParseIntPipe) index: number,
  ) {
    await this.customersService.deleteAddress(user.sub, index);
  }

  @Put('me/addresses/:index/default')
  @ApiOperation({ summary: 'Đặt địa chỉ mặc định' })
  async setDefault(
    @CurrentUser() user: { sub: string },
    @Param('index', ParseIntPipe) index: number,
  ) {
    return this.customersService.setDefaultAddress(user.sub, index);
  }
}
