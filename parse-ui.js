const fs = require('fs');
const xml = fs.readFileSync('./current_device_screen.xml', 'utf8');

const matches = xml.match(/text="([^"]+)"/g);
if (matches) {
  console.log('--- TEXTS ON SCREEN ---');
  matches.forEach(m => console.log(m));
} else {
  console.log('No text found');
}
