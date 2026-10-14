const { MongoClient } = require('mongodb');

async function main() {
  const client = await MongoClient.connect('mongodb://127.0.0.1:27017');
  const db = client.db('greenhouse');

  const mai = await db.collection('users').findOne({ full_name: /Mai/ });
  const tuan = await db.collection('users').findOne({ full_name: /Tuấn/ });

  console.log('Mai:', mai?._id?.toString(), mai?.full_name);
  console.log('Tuan:', tuan?._id?.toString(), tuan?.full_name);

  if (tuan) {
    await db.collection('helperprofiles').updateOne(
      { user_id: tuan._id },
      {
        $set: {
          rating: 4.8,
          total_reviews: 38,
          completed_jobs: 45,
          years_experience: 8,
          completion_rate: 98,
          cancellation_rate: 2,
          location: { type: 'Point', coordinates: [108.2022, 16.0544] },
        },
      },
    );
    console.log('Updated Anh Tuan: rating=4.8, 45 jobs, 8yr exp, Da Nang location');
  }

  if (mai) {
    await db.collection('helperprofiles').updateOne(
      { user_id: mai._id },
      {
        $set: {
          rating: 3.5,
          total_reviews: 12,
          completed_jobs: 15,
          years_experience: 2,
          completion_rate: 85,
          cancellation_rate: 10,
          location: { type: 'Point', coordinates: [106.6297, 10.8231] },
        },
      },
    );
    console.log('Updated Chi Mai: rating=3.5, 15 jobs, 2yr exp, HCM location');
  }

  const profiles = await db.collection('helperprofiles')
    .find({ user_id: { $in: [mai?._id, tuan?._id].filter(Boolean) } })
    .project({ user_id: 1, rating: 1, completed_jobs: 1, years_experience: 1, completion_rate: 1, location: 1 })
    .toArray();
  console.log('\nVerification:');
  profiles.forEach(p => console.log(JSON.stringify(p)));

  await client.close();
}

main().catch(console.error);
