import { registerAs } from '@nestjs/config';

export default registerAs('minio', () => ({
  endpoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
  useSSL: process.env.MINIO_USE_SSL === 'true',
  bucketAvatars: process.env.MINIO_BUCKET_AVATARS || 'avatars',
  bucketIdCards: process.env.MINIO_BUCKET_ID_CARDS || 'id-cards',
  bucketBookingPhotos: process.env.MINIO_BUCKET_BOOKING_PHOTOS || 'booking-photos',
  bucketCompletionPhotos: process.env.MINIO_BUCKET_COMPLETION_PHOTOS || 'completion-photos',
}));
