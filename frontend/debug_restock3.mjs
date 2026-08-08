import fs from 'fs';
const f = 'D:/BMS/frontend/src/pages/owner/OwnerQRWorkspace.jsx';
const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
const line = lines[177]; // line 178
console.log('line 178:', JSON.stringify(line));
console.log('trimmed:', JSON.stringify(line.trim()));
console.log('trimmed length:', line.trim().length);
console.log('chars:', line.trim().split('').map(c => `'${c}'`).join(' '));
