import { createQaApp } from './qa-app';
import { getModelToken } from '@nestjs/mongoose';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JobsService } from '../src/modules/jobs/jobs.service';

async function main() {
  const qa = await createQaApp();
  const jobs = qa.app.get(JobsService);
  const job = await jobs.createJob(qa.accounts.customer.id, {
    service_id: qa.serviceId,
    title: 'QA local job',
    description: 'Local isolated QA only',
    address: {
      full_address: 'QA address',
      district: 'Quan 7',
      city: 'TP HCM',
      location: { type: 'Point', coordinates: [106.701, 10.731] },
    },
  } as any);
  const quote = await jobs.submitQuote(qa.accounts.helper.id, String(job._id), {
    labor_cost: 200000,
    estimated_duration: 60,
  } as any);
  const fixtures = {
    jobId: String(job._id),
    quoteId: String(quote._id),
    serviceId: qa.serviceId,
    helperId: qa.accounts.helper.id,
    customerId: qa.accounts.customer.id,
  };
  writeFileSync(
    resolve(__dirname, '../../..', 'reports/qa-2026-10-20/ui-fixtures.json'),
    JSON.stringify(fixtures, null, 2),
  );
  await qa.app.listen(3100, '127.0.0.1');
  console.log('QA API ready at http://127.0.0.1:3100/api/v1 (disposable database)');
  const close = async () => {
    await qa.close();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
main().catch(error => {
  console.error(error);
  process.exit(1);
});
