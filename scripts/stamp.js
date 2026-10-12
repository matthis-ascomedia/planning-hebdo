// Écrit version.js avec l'identifiant (court) du commit courant, lu par l'application.
// Lancé par le hook .githooks/pre-commit : au moment du commit, HEAD est le commit parent.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch { /* pas de dépôt ou pas encore de commit */ }

const file = path.join(__dirname, '..', 'version.js');
fs.writeFileSync(file, `// Généré par scripts/stamp.js : ne pas éditer à la main.\nwindow.BUILD = { commit: ${JSON.stringify(commit)} };\n`);
console.log(`version.js : commit ${commit || '(inconnu)'}`);
