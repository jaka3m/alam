// simple test just to see if we can instantiate it in a mock CF env
const worker = require('./_worker.js');
console.log("Worker default export present:", !!worker.default.fetch);
