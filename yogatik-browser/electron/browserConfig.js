// ESM wrapper around browserConfig.cjs
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { CONFIG, getConfig } = require('./browserConfig.cjs')

export default CONFIG
export { CONFIG, getConfig }