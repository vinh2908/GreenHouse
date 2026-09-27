const http = require('http');

async function testAdminEndpoints() {
  console.log('1. Logging in as Admin...');
  const loginRes = await new Promise(r => {
    const req = http.request(
      'http://localhost:3000/api/v1/auth/login',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      res => {
        let d = '';
        res.on('data', c => (d += c));
        res.on('end', () => r(JSON.parse(d)));
      },
    );
    req.write(JSON.stringify({ phone: '0999999999', password: 'admin123' }));
    req.end();
  });
  const token = loginRes.data.access_token;
  console.log('Admin Token:', token.substring(0, 15) + '...');

  function getApi(path) {
    return new Promise(r => {
      http.get(
        {
          hostname: 'localhost',
          port: 3000,
          path: '/api/v1' + path,
          headers: { Authorization: `Bearer ${token}` },
        },
        res => {
          let d = '';
          res.on('data', c => (d += c));
          res.on('end', () => {
            try {
              r({ status: res.statusCode, data: JSON.parse(d) });
            } catch (e) {
              r({ status: res.statusCode, raw: d });
            }
          });
        },
      );
    });
  }

  console.log('\n2. Testing Admin API endpoints...');
  const dRes = await getApi('/admin/dashboard');
  console.log(
    `[PASS] GET /admin/dashboard -> ${dRes.status}: Total Revenue: ${dRes.data?.data?.total_revenue?.toLocaleString()}₫, Total Jobs: ${dRes.data?.data?.total_jobs}`,
  );

  const uRes = await getApi('/admin/users');
  console.log(
    `[PASS] GET /admin/users -> ${uRes.status}: ${uRes.data?.data?.users?.length || uRes.data?.data?.length} users`,
  );

  const hRes = await getApi('/admin/helpers');
  console.log(
    `[PASS] GET /admin/helpers -> ${hRes.status}: ${hRes.data?.data?.helpers?.length || hRes.data?.data?.length} helpers`,
  );

  const kycRes = await getApi('/admin/helpers/kyc/pending');
  console.log(
    `[PASS] GET /admin/helpers/kyc/pending -> ${kycRes.status}: ${kycRes.data?.data?.length || 0} pending KYC`,
  );

  const jRes = await getApi('/admin/jobs');
  console.log(
    `[PASS] GET /admin/jobs -> ${jRes.status}: ${jRes.data?.data?.jobs?.length || jRes.data?.data?.length} jobs`,
  );

  const rRes = await getApi('/reviews/admin/all');
  console.log(
    `[PASS] GET /reviews/admin/all -> ${rRes.status}: ${rRes.data?.data?.length || 0} reviews`,
  );

  const txRes = await getApi('/payments/admin/transactions');
  console.log(
    `[PASS] GET /payments/admin/transactions -> ${txRes.status}: ${txRes.data?.data?.length || 0} transactions`,
  );

  const wdRes = await getApi('/payments/admin/withdrawals');
  console.log(
    `[PASS] GET /payments/admin/withdrawals -> ${wdRes.status}: ${wdRes.data?.data?.length || 0} withdrawals`,
  );
}

testAdminEndpoints().catch(console.error);
