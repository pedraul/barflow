import fs from 'fs';

const files = [
  'D:/BMS/frontend/src/pages/manager/Orders.jsx',
  'D:/BMS/frontend/src/pages/owner/OwnerQRWorkspace.jsx',
  'D:/BMS/frontend/src/pages/owner/OwnerWaiterOrders.jsx',
];

for (const f of files) {
  let lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  
  // Strategy: find all lines with .map( and determine if it's implicit or explicit return
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('.map(')) {
      // Check if this is an implicit return (ends with => ( or => (
      if (lines[i].includes('=> (')) {
        // Find the matching closing ))} or )})}
        let j = i + 1;
        while (j < lines.length) {
          if (lines[j].includes('</tr>') || lines[j].includes('</option>') || lines[j].includes('</button>') || lines[j].includes('</li>') || lines[j].includes('</div>')) {
            // Check next few lines for the closing
            let k = j + 1;
            while (k < lines.length && lines[k].trim() === '') k++;
            if (lines[k] && lines[k].includes('))}')) {
              // This is implicit return, should be ))}
              lines[k] = lines[k].replace('))}', '))}');
            } else if (lines[k] && lines[k].includes('))')) {
              // Already correct
            }
            break;
          }
          j++;
        }
      }
    }
  }
  
  fs.writeFileSync(f, lines.join('\n'), 'utf8');
  console.log('Fixed map implicit returns in:', f);
}
