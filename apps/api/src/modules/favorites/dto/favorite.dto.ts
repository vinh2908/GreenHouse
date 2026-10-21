import { IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddFavoriteDto {
  @ApiProperty({ description: 'User ID của thợ muốn thêm vào danh sách yêu thích' })
  @IsMongoId({ message: 'helper_id không hợp lệ' })
  helper_id: string;
}
