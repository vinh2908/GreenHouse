const { exec } = require('child_process');
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
      res.on('data', chunk => body += chunk);
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

async function debugFailedTests() {
  console.log('1. Testing Admin Login with 0999999999 / admin123...');
  const adminRes = await apiCall('POST', '/api/v1/auth/login', { phone: '0999999999', password: 'admin123' });
  console.log('Admin login status:', adminRes.status, adminRes.data);

  console.log('\n2. Testing /auth/me payload format...');
  const custRes = await apiCall('POST', '/api/v1/auth/login', { phone: '0901111111', password: 'password123' });
  const token = custRes.data?.data?.access_token;
  const meRes = await apiCall('GET', '/api/v1/auth/me', null, token);
  console.log('GET /auth/me status:', meRes.status, meRes.data);

  console.log('\n3. Testing Select Quote error detail...');
  const createJob = await apiCall('POST', '/api/v1/jobs', {
    service_id: '6aa1269cd33a3aed2b36a5e1',
    title: 'Test Select Quote',
    description: 'Chi tiết test',
    address: {
      full_address: '123 Đường Test, Quận 1',
      district: 'Quận 1',
      city: 'Hồ Chí Minh',
      location: { type: 'Point', coordinates: [106.6983, 10.7725] }
    }
  }, token);
  const jId = createJob.data?.data?._id;
  
  const helperLogin = await apiCall('POST', '/api/v1/auth/login', { phone: '0902222222', password: 'password123' });
  const hToken = helperLogin.data?.data?.access_token;
  
  const quote = await apiCall('POST', `/api/v1/jobs/${jId}/quotes`, {
    labor_cost: 200000,
    estimated_duration: 2,
    available_date: '2026-09-25T09:00:00.000Z'
  }, hToken);
  const qId = quote.data?.data?._id;
  console.log('Quote created:', qId);

  const select = await apiCall('POST', `/api/v1/jobs/${jId}/select-quote`, {
    quote_id: qId,
    scheduled_at: '2026-09-25T09:00:00.000Z'
  }, token);
  console.log('Select Quote status:', select.status, select.data);

  console.log('\n4. Testing SOS Accept error detail...');
  const sos = await apiCall('POST', '/api/v1/jobs/sos', {
    category: 'electrician',
    title: 'SOS Test',
    description: 'Chập điện',
    address: {
      full_address: '123 Đường Test, Quận 1',
      district: 'Quận 1',
      city: 'Hồ Chí Minh',
      location: { type: 'Point', coordinates: [106.6983, 10.7725] }
    }
  }, token);
  const sosId = sos.data?.data?._id;
  console.log('SOS Job created:', sosId);

  const acceptSos = await apiCall('POST', `/api/v1/jobs/${sosId}/sos-accept`, null, hToken);
  console.log('Accept SOS status:', acceptSos.status, acceptSos.data);
}

debugFailedTests();
