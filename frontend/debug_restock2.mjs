import fs from 'fs';
const f = 'D:/BMS/frontend/src/pages/owner/OwnerQRWorkspace.jsx';
const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
for (let i = 168; i < 182; i++) {
  console.log(i+1, JSON.stringify(lines[i]));
}
