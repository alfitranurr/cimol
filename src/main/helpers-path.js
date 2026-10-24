// Skrip PowerShell tidak bisa dibaca dari dalam app.asar, jadi arahkan ke app.asar.unpacked.
const path = require('path');

function helperPath(name) {
  return path
    .join(__dirname, '..', 'helpers', name)
    .replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

module.exports = { helperPath };
