const http = require('http');

async function testCreateJob() {
  // 1. Login as customer (Chị Mai: 0901111111 / password123)
  const loginData = JSON.stringify({ phone: '0901111111', password: 'password123' });
  
  const token = await new Promise((resolve, reject) => {
    const req = http.request('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          console.log('Login result:', json.success);
          resolve(json.data.access_token);
        } catch (e) { reject(e); }
      });
    });
    req.write(loginData);
    req.end();
  });

  console.log('Token acquired:', token ? token.substring(0, 20) + '...' : 'NONE');

  // 2. Test create job payload identical to mobile booking form
  const jobPayload = {
    service_id: '6aa1269cd33a3aed2b36a5e1',
    title: 'Dọn dẹp nhà chung cư 2 phòng ngủ',
    description: 'Cần dọn dẹp vệ sinh phòng khách và 2 phòng ngủ vào sáng mai',
    address: {
      full_address: '123 Nguyễn Thị Minh Khai, Phường Bến Thành',
      ward: 'Phường Bến Thành',
      district: 'Quận 1',
      city: 'Hồ Chí Minh',
      location: { type: 'Point', coordinates: [106.6983, 10.7725] },
    },
    preferred_date: '2026-09-20',
    preferred_time_start: '09:00',
    is_flexible_time: false,
  };

  const createResult = await new Promise((resolve, reject) => {
    const req = http.request('http://localhost:3000/api/v1/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        console.log('Status code:', res.statusCode);
        console.log('Response body:', d);
        resolve(d);
      });
    });
    req.write(JSON.stringify(jobPayload));
    req.end();
  });
}

testCreateJob().catch(console.error);
