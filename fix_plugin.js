const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/PluginManagerModal.jsx', 'utf8');

// Fix the ending - remove the extra closing braces
content = content.replace(/\s*\)\}\s*\)\}\s*\}\s*<\/Modal>/, '        )}\n      </div>\n    </Modal>');

fs.writeFileSync('frontend/src/components/PluginManagerModal.jsx', content);
console.log('Fixed');