const fs = require('fs');
const xml = fs.readFileSync('./current_device_screen.xml', 'utf8');

const regex = /text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
let m;
while ((m = regex.exec(xml)) !== null) {
  const x1 = parseInt(m[2]), y1 = parseInt(m[3]), x2 = parseInt(m[4]), y2 = parseInt(m[5]);
  console.log(`"${m[1]}" -> (${Math.round((x1+x2)/2)}, ${Math.round((y1+y2)/2)})`);
}
