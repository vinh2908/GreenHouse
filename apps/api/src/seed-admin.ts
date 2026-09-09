import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';

async function checkAndCreateAdmin() {
  await mongoose.connect('mongodb://localhost:27017/homemate');
  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB');

  const usersCollection = db.collection('users');
  let admin = await usersCollection.findOne({ roles: 'admin' });

  const passwordHash = await bcrypt.hash('admin123', 10);

  if (!admin) {
    console.log('Admin user not found. Creating default admin...');
    const newAdmin = {
      phone: '0999999999',
      full_name: 'Quản Trị Viên (Admin Hệ Thống)',
      email: 'admin@homemate.vn',
      password_hash: passwordHash,
      roles: ['admin', 'customer'],
      active_role: 'admin',
      status: 'active',
      is_verified: true,
      is_phone_verified: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
    };
    await usersCollection.insertOne(newAdmin);
    console.log('✅ Admin user created: Phone 0999999999 / Pass admin123');
  } else {
    // Reset pass admin123
    await usersCollection.updateOne(
      { _id: admin._id },
      { $set: { password_hash: passwordHash, status: 'active', is_verified: true } },
    );
    console.log(
      `✅ Admin user exists (${admin.phone} - ${admin.full_name}). Password reset to admin123`,
    );
  }

  process.exit(0);
}

checkAndCreateAdmin().catch(console.error);
