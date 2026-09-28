const fs = require('fs');
let content = fs.readFileSync('frontend/src/tools/devTools.js', 'utf8');

// Fix all single quote issues in the git worktree section
content = content.replace(/chat's/g, "chat\\'s");
content = content.replace(/repo's/g, "repo\\'s");
content = content.replace(/worktree's/g, "worktree\\'s");

fs.writeFileSync('frontend/src/tools/devTools.js', content);
console.log('Fixed');