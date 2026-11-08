import {
  IsString,
  IsOptional,
  IsEnum,
  IsIn,
  IsNumber,
  IsBoolean,
  IsArray,
  IsNotEmpty,
  MaxLength,
  Min,
  Max,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ServiceStatus } from '@homemate/types';

/** K7: Cross-field validator ensuring property >= related property */
export function IsGreaterThanOrEqualToField(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isGreaterThanOrEqualToField',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (value === undefined || value === null) return true;
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];
          if (relatedValue === undefined || relatedValue === null) return true;
          return Number(value) >= Number(relatedValue);
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          return `${args.property} không được nhỏ hơn ${relatedPropertyName}`;
        },
      },
    });
  };
}

/** K7: Cross-field validator ensuring property <= related property */
export function IsLessThanOrEqualToField(property: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isLessThanOrEqualToField',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (value === undefined || value === null) return true;
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];
          if (relatedValue === undefined || relatedValue === null) return true;
          return Number(value) <= Number(relatedValue);
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          return `${args.property} không được lớn hơn ${relatedPropertyName}`;
        },
      },
    });
  };
}

export class CreateServiceCategoryDto {
  @ApiProperty({ example: 'Giúp việc theo giờ' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'giup-viec-theo-gio' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  sort_order?: number;
}

export class CreateServiceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  category_id: string;

  @ApiProperty({ example: 'Giúp việc theo giờ' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'giup-viec-theo-gio' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @IsLessThanOrEqualToField('price_range_max')
  price_range_min?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @IsGreaterThanOrEqualToField('price_range_min')
  price_range_max?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @IsLessThanOrEqualToField('base_price_max')
  base_price_min?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @IsGreaterThanOrEqualToField('base_price_min')
  base_price_max?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @IsLessThanOrEqualToField('estimated_duration_max')
  estimated_duration_min?: number;

  @ApiPropertyOptional({ default: 8 })
  @IsOptional()
  @IsNumber()
  @Max(24)
  @IsGreaterThanOrEqualToField('estimated_duration_min')
  estimated_duration_max?: number;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  platform_fee_percent?: number;

  @ApiPropertyOptional({
    enum: ['quote', 'fixed'],
    default: 'quote',
    description: 'quote = thợ báo giá; fixed = giá cam kết cố định, thợ nhận việc trực tiếp',
  })
  @IsOptional()
  @IsIn(['quote', 'fixed'])
  pricing_model?: 'quote' | 'fixed';

  @ApiPropertyOptional({ default: 0, description: 'Giá cam kết (VNĐ) khi pricing_model = fixed' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fixed_price?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requires_site_visit?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}

export class UpdateServiceStatusDto {
  @ApiProperty({ enum: ServiceStatus })
  @IsEnum(ServiceStatus)
  status: ServiceStatus;
}
