import fs from 'fs';

const files = [
  'D:/BMS/frontend/src/pages/manager/Orders.jsx',
  'D:/BMS/frontend/src/pages/owner/OwnerQRWorkspace.jsx',
  'D:/BMS/frontend/src/pages/owner/OwnerWaiterOrders.jsx',
];

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  const lines = c.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '))}') {
      const indent = lines[i].match(/^\s*/)[0];
      lines[i] = indent + ')})}';
    }
  }
  fs.writeFileSync(f, lines.join('\n'), 'utf8');
  console.log('Fixed:', f);
}
