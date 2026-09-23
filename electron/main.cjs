// Forwarding entry point for Electron launched from workspace root
const path = require('path')
require(path.join(__dirname, '..', 'frontend', 'electron', 'main.cjs'))
