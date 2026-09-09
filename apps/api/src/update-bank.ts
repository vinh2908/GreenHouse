import mongoose from 'mongoose';

async function updateHelperBank() {
  await mongoose.connect('mongodb://localhost:27017/homemate');
  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB');

  const helper = await db.collection('users').findOne({ phone: '0902222222' });
  if (!helper) throw new Error('Helper not found');

  await db.collection('helperprofiles').updateOne(
    { user_id: helper._id },
    {
      $set: {
        bank_account: {
          bank_name: 'Vietcombank',
          account_number: '012345678999',
          account_name: 'NGUYEN VAN TUAN',
        },
      },
    }
  );

  console.log('Bank account updated for Anh Tuấn successfully!');
  process.exit(0);
}

updateHelperBank().catch(console.error);
