import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';

async function resetAllPasswords() {
  await mongoose.connect('mongodb://localhost:27017/homemate');
  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB');

  const hash = await bcrypt.hash('password123', 10);
  await db.collection('users').updateMany(
    {},
    { $set: { password_hash: hash, status: 'active', is_verified: true, is_phone_verified: true } }
  );

  console.log('All user passwords reset to password123 successfully!');
  process.exit(0);
}

resetAllPasswords().catch(console.error);
