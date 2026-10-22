import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { JobsService } from './jobs.service';
import { CreateSosJobDto } from './dto/job.dto';

/**
 * Spec cho việc nới JobAddressDto: district/city được phép trống/thiếu
 * (reverse-geocode không phải lúc nào cũng trả được — không bịa mặc định),
 * trong khi full_address vẫn bắt buộc. Kèm kiểm chứng createSosJob chấp
 * nhận và lưu nguyên địa chỉ có district/city trống.
 */

const basePayload = {
  category: 'electrician',
  title: 'Chập điện khét ổ cắm phòng khách',
  description: 'Ổ cắm tóe lửa, cần thợ xử lý khẩn cấp',
  address: {
    full_address: '45/12 Nguyễn Văn Linh, Thanh Khê',
    ward: '',
    location: { type: 'Point', coordinates: [108.2085, 16.0471] },
  },
};

function makeJobsService() {
  const serviceDoc = { _id: new Types.ObjectId(), slug: 'electrician' };
  const serviceModel = {
    findOne: jest.fn(() => ({ exec: async () => serviceDoc })),
  };
  let createdDoc: Record<string, any> | undefined;
  const jobModel = {
    create: jest.fn(async (doc: Record<string, any>) => {
      createdDoc = doc;
      return { ...doc, _id: new Types.ObjectId(), created_at: new Date() };
    }),
  };
  const helperModel = {
    aggregate: jest.fn(() => ({ exec: async () => [] })),
  };
  const gateway = { emitToUser: jest.fn() };
  const dummy = {} as never;
  const service = new JobsService(
    jobModel as never, // jobModel
    dummy, // quoteModel
    dummy, // contractModel
    serviceModel as never, // serviceModel
    helperModel as never, // helperModel
    dummy, // penaltyEventModel
    gateway as never, // gateway
    dummy, // notificationsService
    dummy, // chatService
    dummy, // paymentsService
    dummy, // routingService
    dummy, // favoritesService
    dummy, // vouchersService
    dummy, // loyaltyService
    dummy, // disputesService
  );
  return { service, jobModel, gateway, getCreated: () => createdDoc };
}

describe('JobAddressDto — district/city optional', () => {
  it('accepts empty-string district/city', async () => {
    const dto = plainToInstance(CreateSosJobDto, {
      ...basePayload,
      address: { ...basePayload.address, district: '', city: '' },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts absent district/city', async () => {
    const dto = plainToInstance(CreateSosJobDto, basePayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('still rejects an empty full_address', async () => {
    const dto = plainToInstance(CreateSosJobDto, {
      ...basePayload,
      address: { ...basePayload.address, full_address: '', district: '', city: '' },
    });
    const errors = await validate(dto);
    const addressError = errors.find(e => e.property === 'address');
    expect(addressError).toBeDefined();
    const childProps = (addressError?.children ?? []).map(c => c.property);
    expect(childProps).toContain('full_address');
  });
});

describe('JobsService.createSosJob — address without district/city', () => {
  it('creates the SOS job and stores district/city as given (empty)', async () => {
    const { service, jobModel, gateway } = makeJobsService();
    const dto = plainToInstance(CreateSosJobDto, {
      ...basePayload,
      address: { ...basePayload.address, district: '', city: '' },
    });

    const job = await service.createSosJob(String(new Types.ObjectId()), dto);

    expect(job).toBeDefined();
    expect(jobModel.create).toHaveBeenCalledTimes(1);
    const created = jobModel.create.mock.calls[0][0] as Record<string, any>;
    expect(created.address.district).toBe('');
    expect(created.address.city).toBe('');
    expect(created.address.full_address).toBe(basePayload.address.full_address);
    expect(gateway.emitToUser).toHaveBeenCalled();
  });
});
