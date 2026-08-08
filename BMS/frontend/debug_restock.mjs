const s = '              )})}';
console.log('trimmed:', JSON.stringify(s.trim()));
console.log('length:', s.trim().length);
console.log('chars:', s.trim().split('').map(c => c.charCodeAt(0)));
