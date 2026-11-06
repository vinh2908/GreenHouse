import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InvoiceDocument = Invoice & Document;

// ─── Hóa đơn điện tử (B54) ────────────────────────────────────────────────────
// Mỗi đơn đã thanh toán chỉ có 1 hóa đơn: số hóa đơn duy nhất (INV-YYYYMMDD-XXXX)
// + bản ghi lưu trữ để đối soát / tải lại. Số được cấp 1 lần duy nhất khi xuất
// lần đầu và tái sử dụng cho các lần tải lại sau (không cấp số mới, không xóa).

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false })
export class Invoice {
  /** Số hóa đơn duy nhất, vd INV-20261107-0001 */
  @Prop({ required: true, unique: true, index: true })
  invoice_no: string;

  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, index: true })
  job_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  customer_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  helper_id?: Types.ObjectId;

  /** Tổng tiền trên hóa đơn (giá chốt − giảm voucher − giảm điểm + phụ phí SOS) */
  @Prop({ required: true })
  total_amount: number;

  /** Phương thức thanh toán lúc xuất hóa đơn (cash | vietqr | wallet | ...) */
  @Prop()
  payment_method?: string;

  @Prop({ default: 'paid' })
  payment_status?: string;

  @Prop()
  issued_at?: Date;

  created_at: Date;
  updated_at: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ invoice_no: 1 }, { unique: true });
InvoiceSchema.index({ job_id: 1 }, { unique: true });
