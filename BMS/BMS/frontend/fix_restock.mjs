import fs from 'fs';

const files = [
  'D:/BMS/frontend/src/pages/manager/Orders.jsx',
  'D:/BMS/frontend/src/pages/owner/OwnerQRWorkspace.jsx',
  'D:/BMS/frontend/src/pages/owner/OwnerWaiterOrders.jsx',
];

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  if (f.includes('manager')) {
    c = c.replace(/<\/tr>\n\s*<\/td>/g, '</tr>\n                      </td>');
    c = c.replace(/<\/tr>\n\s*<\/tbody>/g, '</tr>\n                )})\n              </tbody>');
  } else if (f.includes('OwnerQRWorkspace')) {
    c = c.replace(/<\/tr>\n\s*<\/td>/g, '</tr>\n                      </td>');
    c = c.replace(/<\/tr>\n\s*<\/tbody>/g, '</tr>\n                )})\n              </tbody>');
  } else {
    c = c.replace(/<\/tr>\n\s*<\/td>/g, '</tr>\n                      </td>');
    c = c.replace(/<\/tr>\n\s*<\/tbody>/g, '</tr>\n                    )})\n                  </tbody>');
  }
  fs.writeFileSync(f, c);
  console.log('Fixed:', f);
}
