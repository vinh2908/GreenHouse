const fs = require('fs');
const xml = fs.readFileSync('./current_device_screen.xml', 'utf8');

function findElementBounds(targetText) {
  const regex = new RegExp(
    `text="${targetText}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
    'g',
  );
  let match = regex.exec(xml);
  if (match) {
    const x1 = parseInt(match[1]),
      y1 = parseInt(match[2]),
      x2 = parseInt(match[3]),
      y2 = parseInt(match[4]);
    return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2), bounds: [x1, y1, x2, y2] };
  }
  // Try finding by contains
  const regex2 = new RegExp(
    `text="[^"]*${targetText}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
    'g',
  );
  match = regex2.exec(xml);
  if (match) {
    const x1 = parseInt(match[1]),
      y1 = parseInt(match[2]),
      x2 = parseInt(match[3]),
      y2 = parseInt(match[4]);
    return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2), bounds: [x1, y1, x2, y2] };
  }
  return null;
}

console.log('Tiếp tục gợi ý:', findElementBounds('Tiếp tục với gợi ý này'));
console.log('Tiếp theo:', findElementBounds('Tiếp theo'));
