const explicit = String.fromCharCode(41, 125, 41, 125);
const implicit = String.fromCharCode(41, 41, 125);
console.log('explicit:', explicit.length, [...explicit].map(x => x));
console.log('implicit:', implicit.length, [...implicit].map(x => x));
console.log('same?', explicit === implicit);
