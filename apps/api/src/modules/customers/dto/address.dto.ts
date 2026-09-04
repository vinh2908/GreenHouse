import {
  IsString, IsOptional, IsBoolean, IsNumber, IsArray,
  ValidateNested, IsNotEmpty, MaxLength, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddressLocationDto {
  @ApiProperty({ example: 'Point' })
  @IsString()
  type: string;

  @ApiProperty({ example: [106.6297, 10.8231], description: '[longitude, latitude]' })
  @IsArray()
  @IsNumber({}, { each: true })
  coordinates: [number, number];
}

export class CreateAddressDto {
  @ApiProperty({ example: 'Nhà' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  label: string;

  @ApiProperty({ example: '123 Nguyễn Văn Linh, Phường Tân Phú, Quận 7, TP.HCM' })
  @IsString()
  @IsNotEmpty()
  full_address: string;

  @ApiPropertyOptional({ example: '123 Nguyễn Văn Linh' })
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional({ example: 'Phường Tân Phú' })
  @IsOptional()
  @IsString()
  ward?: string;

  @ApiProperty({ example: 'Quận 7' })
  @IsString()
  @IsNotEmpty()
  district: string;

  @ApiProperty({ example: 'TP. Hồ Chí Minh' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ type: AddressLocationDto })
  @ValidateNested()
  @Type(() => AddressLocationDto)
  location: AddressLocationDto;

  @ApiPropertyOptional({ example: 'Tòa nhà A, tầng 5' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class UpdateAddressDto extends CreateAddressDto {}
