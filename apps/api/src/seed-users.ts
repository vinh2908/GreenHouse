import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';

async function runSeed() {
  await mongoose.connect('mongodb://localhost:27017/homemate');
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB');

  const usersCollection = db.collection('users');
  const helperProfilesCollection = db.collection('helperprofiles');
  const walletsCollection = db.collection('wallets');
  const servicesCollection = db.collection('services');

  const passwordHash = await bcrypt.hash('password123', 10);

  // Customer: Chị Mai
  await usersCollection.updateOne(
    { phone: '0901111111' },
    {
      $set: {
        phone: '0901111111',
        full_name: 'Chị Mai (Khách hàng Quận 1)',
        password_hash: passwordHash,
        roles: ['customer'],
        active_role: 'customer',
        status: 'active',
        is_verified: true,
        is_phone_verified: true,
        is_deleted: false,
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true },
  );

  // Helper: Anh Tuấn
  const helperRes = await usersCollection.findOneAndUpdate(
    { phone: '0902222222' },
    {
      $set: {
        phone: '0902222222',
        full_name: 'Anh Tuấn (Thợ Điện Nước)',
        password_hash: passwordHash,
        roles: ['helper', 'customer'],
        active_role: 'helper',
        status: 'active',
        is_verified: true,
        is_phone_verified: true,
        is_deleted: false,
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true, returnDocument: 'after' },
  );

  const helperId = helperRes?._id || (await usersCollection.findOne({ phone: '0902222222' }))?._id;

  // Helper Profile
  await helperProfilesCollection.updateOne(
    { user_id: helperId },
    {
      $set: {
        user_id: helperId,
        status: 'online',
        verification_status: 'approved',
        id_card_number: '079090123456',
        average_rating: 4.9,
        total_completed: 48,
        cancellation_rate: 0,
        verified_at: new Date(),
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true },
  );

  // Helper Wallet
  await walletsCollection.updateOne(
    { user_id: helperId },
    {
      $set: {
        user_id: helperId,
        balance: 850000,
        total_earned: 4500000,
        total_withdrawn: 3650000,
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true },
  );

  console.log('Users re-seeded with password123 successfully!');
  process.exit(0);
}

runSeed().catch(console.error);
