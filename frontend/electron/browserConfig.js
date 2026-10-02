// ESM wrapper around browserConfig.cjs for compatibility with "type": "module"
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const CONFIG = require('./browserConfig.cjs')

export default CONFIG
export { CONFIG }