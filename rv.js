const fs = require('fs');
const s = fs.readFileSync('./flooder.js','utf8').match(/S\s*=\s*'([^']+)'/)[1];
console.log(Buffer.from(s,'base64').toString('utf8'));