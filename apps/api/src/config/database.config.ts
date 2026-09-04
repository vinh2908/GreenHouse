import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  uri:
    process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/homemate?authSource=admin',
  name: process.env.MONGODB_DB_NAME || 'homemate',
}));
