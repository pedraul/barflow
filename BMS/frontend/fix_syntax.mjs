import fs from 'fs';

const fixes = [
  { file: 'D:/BMS/frontend/src/pages/manager/Orders.jsx', line: 115, expected: '              )})}' },
  { file: 'D:/BMS/frontend/src/pages/manager/Orders.jsx', line: 234, expected: '                )})}' },
  { file: 'D:/BMS/frontend/src/pages/owner/OwnerQRWorkspace.jsx', line: 143, expected: '                )})}' },
  { file: 'D:/BMS/frontend/src/pages/owner/OwnerQRWorkspace.jsx', line: 178, expected: '                      ))}' },
  { file: 'D:/BMS/frontend/src/pages/owner/OwnerWaiterOrders.jsx', line: 97, expected: '              ))}' },
  { file: 'D:/BMS/frontend/src/pages/owner/OwnerWaiterOrders.jsx', line: 159, expected: '                    )})}' },
];

for (const fix of fixes) {
  let c = fs.readFileSync(fix.file, 'utf8');
  const lines = c.split(/\r?\n/);
  const idx = fix.line - 1;
  if (lines[idx].trim() !== fix.expected.trim()) {
    lines[idx] = fix.expected;
    fs.writeFileSync(fix.file, lines.join('\n'), 'utf8');
    console.log('Fixed', fix.file, 'line', fix.line);
  } else {
    console.log('Already correct:', fix.file, 'line', fix.line);
  }
}
