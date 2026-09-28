const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/PluginManagerModal.jsx', 'utf8');

// Find the problematic ending and fix it
// The issue is extra closing braces after the plugin list
// We need to find the pattern and fix it

// The correct ending should be:
//             </div>
//         )}
//       </div>
//     </Modal>
//   )
// }

// Let's find and replace the problematic ending
const badEnding = /\)\}\s*\)\}\s*\)\}\s*<\/div>\s*<\/Modal>/;
const goodEnding = '        )}\n      </div>\n    </Modal>';

content = content.replace(badEnding, goodEnding);

fs.writeFileSync('frontend/src/components/PluginManagerModal.jsx', content);
console.log('Fixed');