import fs from 'fs';

const files = [
  'D:/BMS/frontend/src/pages/manager/Orders.jsx',
  'D:/BMS/frontend/src/pages/owner/OwnerQRWorkspace.jsx',
  'D:/BMS/frontend/src/pages/owner/OwnerWaiterOrders.jsx',
];

for (const f of files) {
  let lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('.map(') && lines[i].includes('=> (')) {
      let j = i + 1;
      while (j < lines.length) {
        if (lines[j].includes('</tr>') || lines[j].includes('</option>') || lines[j].includes('</button>') || lines[j].includes('</li>') || lines[j].includes('</div>')) {
          let k = j + 1;
          while (k < lines.length && lines[k].trim() === '') k++;
          if (lines[k] && lines[k].includes('))}')) {
            lines[k] = lines[k].replace('))}', '))}');
          }
          break;
        }
        j++;
      }
    }
  }
  
  fs.writeFileSync(f, lines.join('\n'), 'utf8');
  console.log('Fixed:', f);
}
