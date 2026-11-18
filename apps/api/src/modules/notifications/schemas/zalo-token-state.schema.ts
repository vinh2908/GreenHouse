import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ZaloTokenStateDocument = ZaloTokenState & Document;

/**
 * R13-I2 — trạng thái token Zalo OA (1 document duy nhất, key = 'zalo-oa').
 *
 * Refresh token của Zalo dùng 1 LẦN và sống ~3 tháng: mỗi lần refresh trả
 * về refresh token MỚI và vô hiệu token cũ. Chỉ lưu trong bộ nhớ thì
 * restart server là đứt chuỗi; chỉ lưu trong env thì mỗi lần refresh phải
 * sửa env tay — nên token mới được upsert vào collection này NGAY sau mỗi
 * lần refresh thành công (xem ZaloTokenService), trước khi access token
 * mới được dùng. Đây là credential — KHÔNG BAO GIỜ log giá trị của nó.
 */
@Schema({ collection: 'zalo_token_states', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class ZaloTokenState {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true })
  refresh_token: string;

  created_at: Date;

  updated_at: Date;
}

export const ZaloTokenStateSchema = SchemaFactory.createForClass(ZaloTokenState);
