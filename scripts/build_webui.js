#!/usr/bin/env node
/**
 * ABD Bank Manager — Build Version Generator
 * Generates BuildVersion.h (C++) and buildVersion.js (ES module)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const OUTPUT_CPP_H = path.join(ROOT, 'Source', 'Core', 'BuildVersion.h');
const OUTPUT_JS = path.join(ROOT, 'WebUI', 'src', 'contracts', 'buildVersion.js');

// Ensure output directories exist
[path.dirname(OUTPUT_CPP_H), path.dirname(OUTPUT_JS)].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- Version Info ---
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const version = packageJson.version;

// Build number: YYYY.MM.DD.HHMM (UTC)
const now = new Date();
const buildNumber = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}.${String(now.getUTCDate()).padStart(2, '0')}.${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`;
const buildTimestamp = now.toISOString();

// Git info (optional)
let gitCommit = 'unknown';
let gitBranch = 'unknown';
try {
  gitCommit = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
  gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
} catch { /* ignore */ }

// --- Generate C++ Header ---
const cppHeader = `// GENERATED FILE — DO NOT EDIT
// Generator: Scripts/build_webui.js

#pragma once

namespace ABD::BankManager {

constexpr const char* kVersion = "${version}";
constexpr const char* kBuildNumber = "${buildNumber}";
constexpr const char* kBuildTimestamp = "${buildTimestamp}";
constexpr const char* kGitCommit = "${gitCommit}";
constexpr const char* kGitBranch = "${gitBranch}";

} // namespace ABD::BankManager
`;

fs.writeFileSync(OUTPUT_CPP_H, cppHeader);
console.log(`✅ Generated: ${path.relative(ROOT, OUTPUT_CPP_H)}`);

// --- Generate JS Module ---
const jsModule = `// GENERATED FILE — DO NOT EDIT
// Generator: Scripts/build_webui.js

export const BUILD_VERSION = {
  version: "${version}",
  buildNumber: "${buildNumber}",
  buildTimestamp: "${buildTimestamp}",
  gitCommit: "${gitCommit}",
  gitBranch: "${gitBranch}"
};

Object.freeze(BUILD_VERSION);
`;

fs.writeFileSync(OUTPUT_JS, jsModule);
console.log(`✅ Generated: ${path.relative(ROOT, OUTPUT_JS)}`);

console.log('\n📦 Build version generated:');
console.log(`   Version: ${version}`);
console.log(`   Build: ${buildNumber}`);
console.log(`   Git: ${gitCommit} (${gitBranch})`);