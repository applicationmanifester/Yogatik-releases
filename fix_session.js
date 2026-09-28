const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/SessionReplayModal.jsx', 'utf8');

// Fix the extra closing brace issue
// The issue is around line 378-379 where there are two closing braces
// We need to remove the extra one

// Pattern: two closing braces on consecutive lines
content = content.replace(/\)\}\s*\)\}\s*<\/div>/, '        )}\n      </div>');

fs.writeFileSync('frontend/src/components/SessionReplayModal.jsx', content);
console.log('Fixed');