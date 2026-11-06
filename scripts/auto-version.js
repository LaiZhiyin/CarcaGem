#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const versionParts = packageJson.version.split('.').map(Number);

if (versionParts.length !== 3 || versionParts.some(part => !Number.isInteger(part) || part < 0)) {
  throw new Error(`Expected a numeric major.minor.patch version, got: ${packageJson.version}`);
}

versionParts[2] += 1;
packageJson.version = versionParts.join('.');
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
lock.name = packageJson.name;
lock.version = packageJson.version;
if (lock.packages?.['']) {
  lock.packages[''].name = packageJson.name;
  lock.packages[''].version = packageJson.version;
}
fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

execFileSync(process.execPath, [path.join(root, 'scripts/update-version.js')], { cwd: root, stdio: 'inherit' });
console.log(`Bumped CarcaGem to v${packageJson.version}.`);
