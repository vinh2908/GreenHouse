const https = require('https');

const apiKey = 'AIzaSyBJS3LEtqmSgGRnR8ecRt1XFd3EKQlLmW8';
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https
  .get(url, res => {
    let data = '';
    res.on('data', chunk => (data += chunk));
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.models) {
          console.log('Available models for your API key:');
          json.models
            .filter(
              m =>
                m.supportedGenerationMethods &&
                m.supportedGenerationMethods.includes('generateContent'),
            )
            .forEach(m => console.log(`- ${m.name}`));
        } else {
          console.log('Response:', data);
        }
      } catch (e) {
        console.error('Parse error:', e, data);
      }
    });
  })
  .on('error', e => {
    console.error('Request error:', e);
  });
