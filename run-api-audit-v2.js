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
          resolve({ status: res.statusCode, data: JSON.parse(body), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body, headers: res.headers });
        }
      });
    });
    req.on('error', err => reject(err));
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runComprehensiveApiAudit() {
  console.log('================================================================================');
  console.log('🚀 HOMEMATE COMPREHENSIVE AUTOMATED API & SECURITY TEST SUITE (ROUND 2)');
  console.log('================================================================================\n');

  const testResults = [];
  function record(category, name, passed, details = '') {
    testResults.push({ category, name, passed, details });
    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] ${category} :: ${name} ${details ? '-> ' + details : ''}`,
    );
  }

  try {
    // 1. Health & Open Endpoints
    const health = await apiCall('GET', '/api/v1/health');
    record('HEALTH', 'GET /api/v1/health', health.status === 200 && health.data?.success === true);

    const aiStatus = await apiCall('GET', '/api/v1/ai/status');
    record(
      'AI',
      'GET /api/v1/ai/status',
      aiStatus.status === 200 && aiStatus.data?.data?.enabled === true,
    );

    const categories = await apiCall('GET', '/api/v1/services/categories');
    record(
      'SERVICES',
      'GET /api/v1/services/categories',
      categories.status === 200 && Array.isArray(categories.data?.data),
    );

    const services = await apiCall('GET', '/api/v1/services');
    record(
      'SERVICES',
      'GET /api/v1/services',
      services.status === 200 && services.data?.data?.length > 0,
    );

    // 2. Authentication Flow
    const loginFail = await apiCall('POST', '/api/v1/auth/login', {
      phone: '0901111111',
      password: 'wrongpassword',
    });
    record('AUTH', 'Login wrong password rejected (401)', loginFail.status === 401);

    const loginEmpty = await apiCall('POST', '/api/v1/auth/login', { phone: '', password: '' });
    record('AUTH', 'Login empty fields rejected (400)', loginEmpty.status === 400);

    // Customer Login (Chị Mai)
    const customerLogin = await apiCall('POST', '/api/v1/auth/login', {
      phone: '0901111111',
      password: 'password123',
    });
    const customerToken = customerLogin.data?.data?.access_token;
    const customerRefreshToken = customerLogin.data?.data?.refresh_token;
    const customerId = customerLogin.data?.data?.user?._id;
    record('AUTH', 'Customer Login (200)', customerLogin.status === 200 && !!customerToken);

    // Helper Login (Anh Tuấn)
    const helperLogin = await apiCall('POST', '/api/v1/auth/login', {
      phone: '0902222222',
      password: 'password123',
    });
    const helperToken = helperLogin.data?.data?.access_token;
    const helperId = helperLogin.data?.data?.user?._id;
    record('AUTH', 'Helper Login (200)', helperLogin.status === 200 && !!helperToken);

    // Admin Login (Phone: 0999999999 / Pass: admin123)
    const adminLogin = await apiCall('POST', '/api/v1/auth/login', {
      phone: '0999999999',
      password: 'admin123',
    });
    const adminToken = adminLogin.data?.data?.access_token;
    record('AUTH', 'Admin Login (200)', adminLogin.status === 200 && !!adminToken);

    // Refresh Token Test
    const refreshRes = await apiCall('POST', '/api/v1/auth/refresh', {
      refresh_token: customerRefreshToken,
    });
    record(
      'AUTH',
      'Refresh Token (200)',
      refreshRes.status === 200 && !!refreshRes.data?.data?.access_token,
    );

    // Verify Session /me
    const meRes = await apiCall('GET', '/api/v1/auth/me', null, customerToken);
    record(
      'AUTH',
      'GET /api/v1/auth/me',
      meRes.status === 200 && meRes.data?.data?.sub === customerId,
    );

    // 3. Authorization & Role Protection Matrix
    const custAdminAccess = await apiCall('GET', '/api/v1/admin/dashboard', null, customerToken);
    record(
      'AUTHZ_SECURITY',
      'Customer blocked from Admin Dashboard (403)',
      custAdminAccess.status === 403,
    );

    const adminDashboard = await apiCall('GET', '/api/v1/admin/dashboard', null, adminToken);
    record('AUTHZ', 'Admin accessing Admin Dashboard (200)', adminDashboard.status === 200);

    const adminUsers = await apiCall('GET', '/api/v1/admin/users', null, adminToken);
    record('ADMIN', 'Admin GET /api/v1/admin/users (200)', adminUsers.status === 200);

    const adminHelpers = await apiCall('GET', '/api/v1/admin/helpers', null, adminToken);
    record('ADMIN', 'Admin GET /api/v1/admin/helpers (200)', adminHelpers.status === 200);

    const adminJobs = await apiCall('GET', '/api/v1/admin/jobs', null, adminToken);
    record('ADMIN', 'Admin GET /api/v1/admin/jobs (200)', adminJobs.status === 200);

    // 4. Job & Quote E2E Lifecycle
    const targetServiceId = services.data.data[0]._id;
    const createJobRes = await apiCall(
      'POST',
      '/api/v1/jobs',
      {
        service_id: targetServiceId,
        title: 'Audit Full Lifecycle Verification',
        description: 'Cần sửa chữa hệ thống và kiểm tra nghiệm thu tự động',
        address: {
          full_address: '999 Đường Test, Phường Bến Thành',
          ward: 'Phường Bến Thành',
          district: 'Quận 1',
          city: 'Hồ Chí Minh',
          location: { type: 'Point', coordinates: [106.6983, 10.7725] },
        },
        preferred_date: '2026-09-25',
        preferred_time_start: '14:00',
        is_flexible_time: false,
      },
      customerToken,
    );
    const createdJobId = createJobRes.data?.data?._id;
    record('JOBS', 'Customer Create Job (201)', createJobRes.status === 201 && !!createdJobId);

    const availJobs = await apiCall('GET', '/api/v1/jobs/available', null, helperToken);
    record('JOBS', 'Helper Available Jobs Feed (200)', availJobs.status === 200);

    const quoteRes = await apiCall(
      'POST',
      `/api/v1/jobs/${createdJobId}/quotes`,
      {
        labor_cost: 300000,
        materials_cost: 50000,
        estimated_duration: 2,
        notes: 'Thợ Tuấn sẵn sàng qua làm ngay',
      },
      helperToken,
    );
    const quoteId = quoteRes.data?.data?._id;
    record('QUOTES', 'Helper Submit Quote (201)', quoteRes.status === 201 && !!quoteId);

    const helperSelectQuote = await apiCall(
      'POST',
      `/api/v1/jobs/${createdJobId}/select-quote`,
      {
        quote_id: quoteId,
        scheduled_at: '2026-09-25T14:00:00Z',
      },
      helperToken,
    );
    record('SECURITY', 'Helper cannot select own quote (403)', helperSelectQuote.status === 403);

    const selectQuoteRes = await apiCall(
      'POST',
      `/api/v1/jobs/${createdJobId}/select-quote`,
      {
        quote_id: quoteId,
        scheduled_at: '2026-09-25T14:00:00Z',
      },
      customerToken,
    );
    record(
      'QUOTES',
      'Customer Select Quote & Contract Created (200)',
      selectQuoteRes.status === 200 && selectQuoteRes.data?.data?.job?.status === 'confirmed',
    );

    const onTheWayRes = await apiCall(
      'PATCH',
      `/api/v1/jobs/${createdJobId}/on-the-way`,
      null,
      helperToken,
    );
    record(
      'JOB_FLOW',
      'Helper On The Way (200)',
      onTheWayRes.status === 200 && onTheWayRes.data?.data?.status === 'helper_on_the_way',
    );

    const arrivedRes = await apiCall(
      'PATCH',
      `/api/v1/jobs/${createdJobId}/arrived`,
      null,
      helperToken,
    );
    record(
      'JOB_FLOW',
      'Helper Arrived (200)',
      arrivedRes.status === 200 && arrivedRes.data?.data?.status === 'helper_arrived',
    );

    const startJobRes = await apiCall(
      'PATCH',
      `/api/v1/jobs/${createdJobId}/start`,
      null,
      helperToken,
    );
    record(
      'JOB_FLOW',
      'Helper Start Job In Progress (200)',
      startJobRes.status === 200 && startJobRes.data?.data?.status === 'in_progress',
    );

    const completeJobRes = await apiCall(
      'PATCH',
      `/api/v1/jobs/${createdJobId}/complete`,
      {
        completion_photos: ['https://images.unsplash.com/photo-test-completion-1.jpg'],
        completion_videos: ['https://video.homemate.vn/evidence-sample.mp4'],
        completion_notes: 'Đã hoàn thành xuất sắc và vệ sinh dọn dẹp sạch sẽ.',
      },
      helperToken,
    );
    record(
      'JOB_FLOW',
      'Helper Complete with Photos/Videos (200)',
      completeJobRes.status === 200 && completeJobRes.data?.data?.status === 'pending_review',
    );

    const approveRes = await apiCall(
      'PATCH',
      `/api/v1/jobs/${createdJobId}/approve`,
      {
        rating: 5,
        review: 'Thợ rất nhiệt tình, tay nghề giỏi 5 sao!',
      },
      customerToken,
    );
    record(
      'JOB_FLOW',
      'Customer Approve & Review (200)',
      approveRes.status === 200 && approveRes.data?.data?.status === 'completed',
    );

    // 5. Payment Wallet
    const customerWallet = await apiCall('GET', '/api/v1/payments/wallet', null, customerToken);
    record('PAYMENTS', 'Customer Wallet balance check (200)', customerWallet.status === 200);

    const helperWallet = await apiCall('GET', '/api/v1/payments/wallet', null, helperToken);
    record('PAYMENTS', 'Helper Wallet balance check (200)', helperWallet.status === 200);

    // 6. SOS Emergency Flow
    const sosRes = await apiCall(
      'POST',
      '/api/v1/jobs/sos',
      {
        category: 'electrician',
        title: 'Cứu hộ chập điện khẩn cấp',
        description: 'Chập cầu dao tổng trong đêm',
        address: {
          full_address: '128 Lê Lợi, P. Bến Thành, Q1',
          ward: 'Phường Bến Thành',
          district: 'Quận 1',
          city: 'Hồ Chí Minh',
          location: { type: 'Point', coordinates: [106.6983, 10.7725] },
        },
        surcharge: 100000,
      },
      customerToken,
    );
    const sosJobId = sosRes.data?.data?._id;
    record('SOS', 'Customer Create SOS Emergency (201)', sosRes.status === 201 && !!sosJobId);

    const sosAcceptRes = await apiCall(
      'POST',
      `/api/v1/jobs/${sosJobId}/sos-accept`,
      null,
      helperToken,
    );
    record(
      'SOS',
      'Helper Instant SOS Accept (200)',
      sosAcceptRes.status === 200 && sosAcceptRes.data?.data?.job?.status === 'confirmed',
    );

    // 7. Security & Injection Tests
    const sqlInjection = await apiCall('POST', '/api/v1/auth/login', {
      phone: "' OR '1'='1",
      password: "' OR '1'='1",
    });
    record(
      'SECURITY',
      'SQL/NoSQL Injection Login rejection',
      sqlInjection.status === 400 || sqlInjection.status === 401,
    );

    const xssJob = await apiCall(
      'POST',
      '/api/v1/jobs',
      {
        service_id: targetServiceId,
        title: '<script>alert("XSS")</script>',
        description: '<img src=x onerror=alert(1)>',
        address: {
          full_address: '123 Fake Street',
          district: 'Quận 1',
          city: 'Hồ Chí Minh',
          location: { type: 'Point', coordinates: [106.6983, 10.7725] },
        },
      },
      customerToken,
    );
    record('SECURITY', 'XSS payload handled cleanly without server crash', xssJob.status === 201);

    // 8. Performance Benchmark Check
    const perfStart = Date.now();
    await apiCall('GET', '/api/v1/services');
    const perfDuration = Date.now() - perfStart;
    record('PERFORMANCE', `GET /services latency (< 100ms): ${perfDuration}ms`, perfDuration < 100);

    // 9. Summary
    console.log(
      '\n================================================================================',
    );
    console.log(`📊 TOTAL TESTS: ${testResults.length}`);
    const passedCount = testResults.filter(t => t.passed).length;
    const failedCount = testResults.filter(t => !t.passed).length;
    console.log(`✅ PASSED: ${passedCount}`);
    console.log(`❌ FAILED: ${failedCount}`);
    console.log(`🎯 PASS RATE: ${Math.round((passedCount / testResults.length) * 100)}%`);
    console.log('================================================================================');
  } catch (err) {
    console.error('Fatal Test Suite Error:', err);
  }
}

runComprehensiveApiAudit();
