// scripts/copy-assets.js
// Copie les fichiers statiques (HTML, CSS) vers le répertoire dist/
// en préservant la structure du projet
// À exécuter après la compilation TypeScript

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();

// Chemins source et destination
const srcPaths = [
  'src/presentation',
  'src/applications'
];

// Extensions à copier
const extensions = ['.html', '.css'];

function copyAssets() {
  srcPaths.forEach(srcBase => {
    const fullSrcPath = path.join(projectRoot, srcBase);
    
    if (!fs.existsSync(fullSrcPath)) {
      console.warn(`Répertoire source non trouvé: ${fullSrcPath}`);
      return;
    }
    
    // Parcourir récursivement
    function walkDir(dir, relPath = '') {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        // Preserver la structure : src/presentation/... -> dist/presentation/...
        // srcBase = 'src/presentation' ou 'src/applications'
        // On veut dist/presentation/... ou dist/applications/...
        const destRelPath = path.join(srcBase.replace(/^src\//, ''), relPath, item.name);
        const destFullPath = path.join(projectRoot, 'dist', destRelPath);
        
        if (item.isDirectory()) {
          // Créer le répertoire de destination
          fs.mkdirSync(destFullPath, { recursive: true });
          walkDir(fullPath, path.join(relPath, item.name));
        } else if (item.isFile()) {
          // Copier si c'est un fichier HTML ou CSS
          const ext = path.extname(item.name).toLowerCase();
          if (extensions.includes(ext)) {
            fs.copyFileSync(fullPath, destFullPath);
            console.log(`Copié: ${fullPath} -> ${destFullPath}`);
          }
        }
      }
    }
    
    walkDir(fullSrcPath);
  });
  
  console.log('Copie des assets terminée!');
}

// Exécuter
try {
  copyAssets();
} catch (error) {
  console.error('Erreur lors de la copie des assets:', error.message);
  process.exit(1);
}
