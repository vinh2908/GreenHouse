const mongoose = require('mongoose');

async function auditDatabase() {
  console.log('================================================================================');
  console.log('🗄️ HOMEMATE DATABASE SCHEMA & CONSISTENCY AUDIT');
  console.log('================================================================================\n');

  await mongoose.connect('mongodb://localhost:27017/homemate');
  const db = mongoose.connection.db;

  const collections = await db.listCollections().toArray();
  console.log(`📌 Total Collections in DB: ${collections.length}`);

  for (const c of collections) {
    const count = await db.collection(c.name).countDocuments();
    console.log(`  - ${c.name.padEnd(22)} : ${count} records`);
  }

  // Check data integrity
  console.log('\n🔍 Verifying Data Integrity...');

  // 1. Check user roles consistency
  const users = await db.collection('users').find({}).toArray();
  let invalidRolesCount = 0;
  for (const u of users) {
    if (!u.roles || !Array.isArray(u.roles) || u.roles.length === 0) invalidRolesCount++;
  }
  console.log(`  - Users with invalid roles: ${invalidRolesCount} (Expected 0)`);

  // 2. Check Jobs & Helper relations
  const jobs = await db.collection('jobs').find({}).toArray();
  let orphanedHelpers = 0;
  for (const j of jobs) {
    if (j.helper_id) {
      const helper = await db.collection('users').findOne({ _id: j.helper_id });
      if (!helper) orphanedHelpers++;
    }
  }
  console.log(`  - Jobs with orphaned helper_id: ${orphanedHelpers} (Expected 0)`);

  // 3. Check Contracts linked to Jobs
  const contracts = await db.collection('contracts').find({}).toArray();
  let orphanedContracts = 0;
  for (const ct of contracts) {
    const job = await db.collection('jobs').findOne({ _id: ct.job_id });
    if (!job) orphanedContracts++;
  }
  console.log(`  - Contracts with orphaned job_id: ${orphanedContracts} (Expected 0)`);

  // 4. Check 2dsphere indexes
  const jobIndexes = await db.collection('jobs').indexes();
  const hasGeoIndex = jobIndexes.some(
    idx => idx.name.includes('location_2dsphere') || JSON.stringify(idx.key).includes('2dsphere'),
  );
  console.log(
    `  - Jobs collection 2dsphere GeoSpatial Index: ${hasGeoIndex ? 'PRESENT (✅)' : 'MISSING (❌)'}`,
  );

  const helperIndexes = await db.collection('helperprofiles').indexes();
  const hasHelperGeo = helperIndexes.some(
    idx => idx.name.includes('location_2dsphere') || JSON.stringify(idx.key).includes('2dsphere'),
  );
  console.log(
    `  - HelperProfiles collection 2dsphere GeoSpatial Index: ${hasHelperGeo ? 'PRESENT (✅)' : 'MISSING (❌)'}`,
  );

  console.log('\n================================================================================');
  console.log('✅ DATABASE AUDIT COMPLETED SUCCESSFULLY');
  console.log('================================================================================');
  process.exit(0);
}

auditDatabase().catch(console.error);
