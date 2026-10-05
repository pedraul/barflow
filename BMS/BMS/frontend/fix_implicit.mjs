import fs from 'fs';

const files = [
  'D:/BMS/frontend/src/pages/manager/Orders.jsx',
  'D:/BMS/frontend/src/pages/owner/OwnerQRWorkspace.jsx',
  'D:/BMS/frontend/src/pages/owner/OwnerWaiterOrders.jsx',
];

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  
  // Fix the .map implicit return issue: change )})} back to ))}
  // This fixes arrow functions like {items.map((item) => ( <tr/> ))}
  c = c.replace(/\}\)\}\)/g, '))}');
  
  fs.writeFileSync(f, c, 'utf8');
  console.log('Fixed implicit returns in:', f);
}
