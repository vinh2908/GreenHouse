const http = require('http');

async function checkDashboardBody() {
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

  http.get(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/admin/dashboard',
      headers: { Authorization: `Bearer ${token}` },
    },
    res => {
      let d = '';
      res.on('data', c => (d += c));
      res.on('end', () => console.log('Dashboard Data:', JSON.stringify(JSON.parse(d), null, 2)));
    },
  );
}

checkDashboardBody();
