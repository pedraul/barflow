const implicit = '))}';
const explicit = '))})';
console.log('implicit:', implicit.length, [...implicit].map(x => x.charCodeAt(0)));
console.log('explicit:', explicit.length, [...explicit].map(x => x.charCodeAt(0)));
console.log('implicit===explicit:', implicit===explicit);
console.log('implicit includes explicit:', implicit.includes(explicit));
console.log('explicit includes implicit:', explicit.includes(implicit));
