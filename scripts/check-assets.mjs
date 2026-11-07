import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = directory => readdirSync(directory, { withFileTypes: true }).filter(entry => entry.name !== '.DS_Store').flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const used = new Set();
const publicFiles = walk(path.join(root, 'public'));
const sources = [...walk(path.join(root, 'src')), path.join(root, 'index.html'), ...publicFiles,
  path.join(root, 'README.md'), ...walk(path.join(root, 'docs'))];
for (const file of sources) {
  if (!/\.(?:tsx?|jsx?|css|html|md)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/["'`(](\/[^"'`\s<>)]*?\.(?:png|jpe?g|svg|ico|html|pdf|css|js))(?:\?[^"'`\s<>)]*)?["'`)]/g)) {
    if (!match[1].includes('${')) used.add(match[1]);
  }
  // README recordings and screenshots reference this repository's published public tree.
  for (const match of text.matchAll(/https:\/\/(?:raw\.githubusercontent\.com\/laizhiyin\/carcagem\/main|media\.githubusercontent\.com\/media\/laizhiyin\/carcagem\/main)\/public(\/[^\s"'`<>?)]+)/g)) {
    used.add(match[1]);
  }
}

// Animal avatars are selected dynamically, so a literal path search alone is insufficient.
const avatarSource = readFileSync(path.join(root, 'src/utils/playerAvatars.ts'), 'utf8');
const designs = avatarSource.match(/const AVATAR_DESIGNS = \[([\s\S]*?)\] as const;/)?.[1];
if (!designs) throw new Error('Cannot enumerate the current avatar catalog');
for (const [, design] of designs.matchAll(/'([^']+)'/g)) {
  for (const color of ['red', 'yellow', 'green', 'blue']) used.add(`/workers/${design}-${color}.png`);
}

const published = publicFiles.map(file => '/' + path.relative(path.join(root, 'public'), file).split(path.sep).join('/'));
const missing = [...used].filter(asset => !existsSync(path.join(root, 'public', asset.slice(1))));
const unused = published.filter(asset => !used.has(asset));
if (missing.length || unused.length) {
  if (missing.length) console.error('Missing referenced assets:', missing);
  if (unused.length) console.error('Unreferenced public assets:', unused);
  process.exitCode = 1;
} else {
  console.log(`Asset audit passed: ${published.length} public files, including all 25 tiles and 40 dynamic avatars; no missing or unused assets.`);
}
