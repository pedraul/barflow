import fs from 'fs';

const f = 'D:/BMS/frontend/src/pages/manager/Orders.jsx';
let c = fs.readFileSync(f, 'utf8');
const lines = c.split(/\r?\n/);

// Fix line 115 (select options) - should be )})}
// and line 234 (orders map) - should be )})}
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('option') && lines[i].includes('All') && lines[i].includes('s ||')) {
    // This is inside a select option, the closing should be )})}
    const indent = lines[i].match(/^\s*/)[0];
    if (lines[i].trim() === '))}') {
      lines[i] = indent + '))}';
      console.log('Fixed select option closing at line', i+1);
    }
  }
}

fs.writeFileSync(f, lines.join('\n'), 'utf8');
console.log('Done');
