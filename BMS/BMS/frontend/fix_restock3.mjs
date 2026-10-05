import fs from 'fs';

const f = 'D:/BMS/frontend/src/pages/manager/Orders.jsx';
let c = fs.readFileSync(f, 'utf8');
const lines = c.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === ')})}') {
    const indent = lines[i].match(/^\s*/)[0];
    // Check context: if it's inside a select option, revert to original
    if (lines[i-1] && lines[i-1].includes('</option>')) {
      lines[i] = indent + ')})}';
      console.log('Reverted line', i+1, 'in', f);
    }
  }
}
fs.writeFileSync(f, lines.join('\n'), 'utf8');
