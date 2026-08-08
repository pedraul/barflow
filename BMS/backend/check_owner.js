const fs = require('fs');
let c = fs.readFileSync('controllers/ownerController.js', 'utf8');

const marker = '// Update individual settings if provided (UPDATE-or-INSERT, no unique constraint required)';
const idx = c.indexOf(marker);
console.log('Found marker at:', idx);
if (idx === -1) {
  console.log('Marker not found!');
  process.exit(1);
}

const before = c.slice(0, idx);
const after = c.slice(idx);
console.log('Before length:', before.length);
console.log('After starts with:', after.slice(0, 100));

// Find the end of the settings block
const endMarker = '    await logAudit({';
const endIdx = after.indexOf(endMarker);
console.log('End marker at:', endIdx);
if (endIdx !== -1) {
  console.log('Block to replace:', after.slice(0, endIdx + 20));
}
