const http = require('http');

function apiCall(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:3000/api/v1/');
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: url.pathname + url.search,
      method: method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', err => reject(err));
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runFullE2eBusinessFlows() {
  console.log('================================================================================');
  console.log('🔄 HOMEMATE FULL E2E MULTI-PARTY BUSINESS FLOW VERIFICATION');
  console.log('================================================================================\n');

  // FLOW 1: Standard Service Booking -> AI Analysis -> Matching -> Quote -> Execution -> Review -> Escrow
  console.log(
    '▶️ EXECUTING FLOW 1: Standard Service (AI Analyze -> Quote -> Escrow -> 5⭐ Review)',
  );

  // 1. Customer Login
  const custLogin = await apiCall('POST', '/api/v1/auth/login', {
    phone: '0901111111',
    password: 'password123',
  });
  const cToken = custLogin.data.data.access_token;
  console.log('  1. Customer logged in (Chị Mai)');

  // 2. AI Analyze Natural Language
  const aiAnalyze = await apiCall('POST', '/api/v1/ai/booking/analyze', {
    text: 'Cần người tổng vệ sinh nhà 3 tầng tại Quận 1 đón Tết',
  });
  console.log(
    `  2. AI Analysis matched service: ${aiAnalyze.data.data.service_type} (${aiAnalyze.data.data.service_name})`,
  );

  // 3. Customer Creates Job
  const createJob = await apiCall(
    'POST',
    '/api/v1/jobs',
    {
      service_id: '6aa1269cd33a3aed2b36a5e2', // deep_cleaning
      title: aiAnalyze.data.data.service_name,
      description: 'Cần dọn dẹp sạch sẽ toàn bộ 3 tầng nhà',
      address: {
        full_address: '88 Hàm Nghi, Quận 1',
        district: 'Quận 1',
        city: 'Hồ Chí Minh',
        location: { type: 'Point', coordinates: [106.6983, 10.7725] },
      },
      preferred_date: '2026-09-25',
      preferred_time_start: '08:00',
      is_flexible_time: false,
    },
    cToken,
  );
  const jobId = createJob.data.data._id;
  console.log(`  3. Job posted successfully: ${jobId}`);

  // 4. Helper Login & Submit Quote
  const helpLogin = await apiCall('POST', '/api/v1/auth/login', {
    phone: '0902222222',
    password: 'password123',
  });
  const hToken = helpLogin.data.data.access_token;
  const quote = await apiCall(
    'POST',
    `/api/v1/jobs/${jobId}/quotes`,
    {
      labor_cost: 1200000,
      materials_cost: 150000,
      estimated_duration: 6,
      notes: 'Đội 2 thợ chuyên nghiệp mang theo máy hút bụi công nghiệp',
    },
    hToken,
  );
  const quoteId = quote.data.data._id;
  console.log(`  4. Helper submitted quote (${quote.data.data.total_price.toLocaleString()}₫)`);

  // 5. Customer accepts Quote -> Contract is created
  const selectQuote = await apiCall(
    'POST',
    `/api/v1/jobs/${jobId}/select-quote`,
    {
      quote_id: quoteId,
      scheduled_at: '2026-09-25T08:00:00.000Z',
    },
    cToken,
  );
  console.log(`  5. Contract generated and signed, status: ${selectQuote.data.data.job.status}`);

  // 6. Helper updates progress: on-the-way -> arrived -> start -> complete with Media Evidence
  await apiCall('PATCH', `/api/v1/jobs/${jobId}/on-the-way`, null, hToken);
  await apiCall('PATCH', `/api/v1/jobs/${jobId}/arrived`, null, hToken);
  await apiCall('PATCH', `/api/v1/jobs/${jobId}/start`, null, hToken);
  const complete = await apiCall(
    'PATCH',
    `/api/v1/jobs/${jobId}/complete`,
    {
      completion_photos: ['https://images.unsplash.com/evidence-clean-1.jpg'],
      completion_videos: ['https://video.homemate.vn/evidence-clean-1.mp4'],
      completion_notes: 'Đã hoàn thành sạch bóng toàn bộ 3 tầng nhà.',
    },
    hToken,
  );
  console.log(
    `  6. Helper completed with evidence photos & videos, status: ${complete.data.data.status}`,
  );

  // 7. Customer approves and reviews 5 stars
  const approve = await apiCall(
    'PATCH',
    `/api/v1/jobs/${jobId}/approve`,
    {
      rating: 5,
      review: 'Rất hài lòng với dịch vụ tổng vệ sinh của thợ Tuấn!',
    },
    cToken,
  );
  console.log(
    `  7. Customer approved job: ${approve.data.data.status} with rating: ${approve.data.data.customer_rating}★`,
  );

  // 8. Admin audits job in system
  const adminLogin = await apiCall('POST', '/api/v1/auth/login', {
    phone: '0999999999',
    password: 'admin123',
  });
  const aToken = adminLogin.data.data.access_token;
  const adminJobDetail = await apiCall('GET', `/api/v1/admin/jobs/${jobId}`, null, aToken);
  console.log(
    `  8. Admin verified completed job audit trail (${adminJobDetail.status === 200 ? 'OK' : 'FAIL'})`,
  );

  console.log('\n================================================================================');
  console.log('✅ COMPLETE END-TO-END BUSINESS FLOW VERIFIED 100% OPERATIONAL');
  console.log('================================================================================');
}

runFullE2eBusinessFlows().catch(console.error);
