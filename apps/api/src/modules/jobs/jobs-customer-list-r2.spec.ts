import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { JobsService } from './jobs.service';
import { Job, JobDocument, JobSchema } from './schemas/job.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { JobStatus } from '@homemate/types';

/**
 * Spec R2: /jobs của khách trống cả 7 tab (live 2026-11-12, 19:46–19:56).
 *
 * Triệu chứng live: khách Khách (0334818713) mở /jobs thấy EmptyState trên
 * TẤT CẢ tab — đơn B (confirmed), C (open/receiving_quotes), A (cancelled)
 * đều không hiện — trong khi trang chi tiết từng đơn vẫn tải đầy đủ.
 *
 * Nguyên nhân (đã kiểm chứng với Mongo + Mongoose thật, không phải fake):
 * - `getCustomerJobs` cũ lọc `{ customer_id: new Types.ObjectId(sub) }`.
 *   Mongo chỉ so khớp ĐÚNG KIỂU: một document có `customer_id` lưu dạng
 *   CHUỖI hex (ghi thô qua native driver / seed / Atlas — không qua
 *   Mongoose nên không được cast sang ObjectId) sẽ KHÔNG khớp filter
 *   ObjectId, dù là cùng một id.
 * - Ngược lại trang chi tiết vẫn mở được: `getJobById`/`getJobForUser` chỉ
 *   so sánh `String(job.customer_id)` (và Mongoose còn cast chuỗi thành
 *   ObjectId khi hydrate document), nên quyền sở hữu vẫn khớp.
 * - Sửa naive `$in: [ObjectId, 'hex']` KHÔNG cứu được: Mongoose cast mọi
 *   phần tử của filter theo kiểu schema (ObjectId) nên chuỗi lại thành
 *   ObjectId và vẫn trượt — kiểm chứng trong spec này bằng model thật
 *   (mongodb-memory-server), không dùng model fake.
 * - Fix: so khớp bằng `$expr: { $eq: [{ $toString: '$customer_id' }, id] }`
 *   — `$expr` được truyền thẳng, không bị Mongoose cast: ObjectId → hex,
 *   chuỗi → chính nó. Áp dụng tương tự cho `getHelperJobs` (`helper_id`).
 *
 * Các test dưới đây PHẢI FAIL trên code cũ (9515dd7) và PASS sau fix.
 */

const ADDRESS = {
  full_address: '1 Test, Quận 1, TP. Hồ Chí Minh',
  district: 'Quận 1',
  city: 'TP. Hồ Chí Minh',
  location: { type: 'Point', coordinates: [106.7, 10.77] },
};

describe('JobsService customer/helper lists (R2 — string-stored owner id)', () => {
  let mongod: MongoMemoryServer;
  let testingModule: TestingModule;
  let service: JobsService;
  let jobModel: Model<JobDocument>;
  let userModel: Model<any>;
  let customerId: Types.ObjectId;
  let helperId: Types.ObjectId;
  let otherId: Types.ObjectId;
  let stringJobId: Types.ObjectId; // đơn B: customer_id lưu dạng CHUỖI

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    testingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Job.name, schema: JobSchema },
          { name: Service.name, schema: ServiceSchema },
          { name: User.name, schema: UserSchema },
        ]),
      ],
    }).compile();
    jobModel = testingModule.get<Model<JobDocument>>(getModelToken(Job.name));
    userModel = testingModule.get<Model<any>>(getModelToken(User.name));
    const dummy = {} as never;
    service = new JobsService(
      jobModel,
      dummy, // quoteModel
      dummy, // contractModel
      dummy, // serviceModel
      dummy, // helperModel
      dummy, // penaltyEventModel
      dummy, // userModel
      dummy, // gateway
      dummy, // notificationsService
      dummy, // chatService
      dummy, // paymentsService
      dummy, // routingService
      dummy, // favoritesService
      dummy, // vouchersService
      dummy, // loyaltyService
      dummy, // disputesService
    );

    customerId = new Types.ObjectId();
    helperId = new Types.ObjectId();
    otherId = new Types.ObjectId();
    stringJobId = new Types.ObjectId();
    const hex = customerId.toHexString();

    // Chủ đơn phải tồn tại để populate('customer_id') ở getJobById resolve
    // được (live: user thật tồn tại; populate về null chỉ vì spec không tạo user).
    await userModel.create({
      _id: customerId,
      phone: '0334818713',
      full_name: 'Khách R2',
      password_hash: 'x',
    });

    // A: đơn thường — customer_id ObjectId (đường tạo đơn qua Mongoose).
    await jobModel.create({
      customer_id: customerId,
      status: JobStatus.OPEN,
      title: 'R2-A objectid open',
      description: 'probe',
      address: ADDRESS,
    });
    // B: đơn confirmed — customer_id lưu dạng CHUỖI hex (ghi thô, như
    // seed-rich-jobs.ts / Atlas: db.collection('jobs').insertOne).
    await jobModel.collection.insertOne({
      _id: stringJobId,
      customer_id: hex,
      helper_id: helperId,
      status: JobStatus.CONFIRMED,
      title: 'R2-B string confirmed',
      description: 'probe',
      address: ADDRESS,
      created_at: new Date(),
      updated_at: new Date(),
    });
    // C: đơn cancelled — customer_id dạng chuỗi.
    await jobModel.collection.insertOne({
      _id: new Types.ObjectId(),
      customer_id: hex,
      status: JobStatus.CANCELLED,
      title: 'R2-C string cancelled',
      description: 'probe',
      address: ADDRESS,
      created_at: new Date(),
      updated_at: new Date(),
    });
    // D: đơn của khách khác — không được lọt vào list.
    await jobModel.create({
      customer_id: otherId,
      status: JobStatus.OPEN,
      title: 'R2-D other customer',
      description: 'probe',
      address: ADDRESS,
    });
    // E: helper_id lưu dạng CHUỖI (đối xứng phía thợ), chủ đơn là khách khác.
    await jobModel.collection.insertOne({
      _id: new Types.ObjectId(),
      customer_id: otherId,
      helper_id: helperId.toHexString(),
      status: JobStatus.CANCELLED,
      title: 'R2-E string helper cancelled',
      description: 'probe',
      address: ADDRESS,
      created_at: new Date(),
      updated_at: new Date(),
    });
    // F: helper_id ObjectId bình thường, chủ đơn là khách khác.
    await jobModel.create({
      customer_id: otherId,
      helper_id: helperId,
      status: JobStatus.OPEN,
      title: 'R2-F objectid helper open',
      description: 'probe',
      address: ADDRESS,
    });
  }, 120000);

  afterAll(async () => {
    await testingModule?.close();
    await mongod?.stop();
  });

  it('R2-1: GET /jobs/my?page=1&limit=10 (tab "Tất cả") thấy cả đơn ObjectId lẫn đơn chuỗi', async () => {
    const res: any = await service.getCustomerJobs(customerId.toHexString(), undefined, 1, 10);
    expect(res.total).toBe(3);
    expect(res.items.map((j: any) => j.title).sort()).toEqual([
      'R2-A objectid open',
      'R2-B string confirmed',
      'R2-C string cancelled',
    ]);
    expect(res.items.map((j: any) => j.title)).not.toContain('R2-D other customer');
  });

  it('R2-2: tab "Đã hủy" (status=cancelled) thấy đơn chuỗi đã hủy', async () => {
    const res: any = await service.getCustomerJobs(customerId.toHexString(), 'cancelled', 1, 10);
    expect(res.total).toBe(1);
    expect(res.items[0].title).toBe('R2-C string cancelled');
  });

  it('R2-3: tab nhiều status (open,confirmed) thấy cả 2 dạng lưu trữ', async () => {
    const res: any = await service.getCustomerJobs(
      customerId.toHexString(),
      'open,confirmed',
      1,
      10,
    );
    expect(res.total).toBe(2);
    expect(res.items.map((j: any) => j.title).sort()).toEqual([
      'R2-A objectid open',
      'R2-B string confirmed',
    ]);
  });

  it('R2-4: không phân trang (home dùng useMyJobs() không page/limit) cũng thấy đủ 3 đơn', async () => {
    const res: any = await service.getCustomerJobs(customerId.toHexString());
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(3);
  });

  it('R2-5: danh sách thợ thấy cả đơn helper_id ObjectId lẫn chuỗi', async () => {
    const res: any = await service.getHelperJobs(helperId.toHexString(), undefined, 1, 10);
    expect(res.total).toBe(3);
    expect(res.items.map((j: any) => j.title).sort()).toEqual([
      'R2-B string confirmed',
      'R2-E string helper cancelled',
      'R2-F objectid helper open',
    ]);
  });

  it('R2-6: tab "Đã hủy" phía thợ thấy đơn helper_id chuỗi', async () => {
    const res: any = await service.getHelperJobs(helperId.toHexString(), 'cancelled', 1, 10);
    expect(res.total).toBe(1);
    expect(res.items[0].title).toBe('R2-E string helper cancelled');
  });

  it('R2-7: trang chi tiết vẫn mở được đơn customer_id chuỗi (đúng triệu chứng live)', async () => {
    const job = await service.getJobById(stringJobId.toHexString());
    expect(job.status).toBe(JobStatus.CONFIRMED);
    // getJobForUser so sánh bằng String(...) nên vẫn nhận đúng chủ đơn.
    expect(String((job.customer_id as any)?._id ?? job.customer_id)).toBe(customerId.toHexString());
  });

  it('R2-8: sub không phải hex hợp lệ trả [] thay vì 500 BSONError', async () => {
    const res: any = await service.getCustomerJobs('not-an-objectid', undefined, 1, 10);
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
  });
});
