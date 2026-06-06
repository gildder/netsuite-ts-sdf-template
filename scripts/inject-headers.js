/**
 * Injects JSDoc headers (@NApiVersion, @NScriptType, @NModuleScope)
 * from TypeScript source files into the compiled AMD JavaScript output.
 *
 * NetSuite requires these headers in the deployed JS files.
 * tsc strips file-level JSDoc when compiling to AMD modules,
 * so we copy them from the source .ts to the output .js.
 */
const fs = require('node:fs');
const path = require('node:path');

const TS_ROOT = 'src/TypeScripts/multicard-api';
const JS_ROOT = 'src/FileCabinet/SuiteScripts/multicard-api';

const JSDOC_RE = /^\/\*\*[\s\S]*?\*\/\s*/;

function extractHeader(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(JSDOC_RE);
  if (!match) return null;

  const header = match[0];
  // Only return if it has NetSuite annotations
  if (/@NApiVersion|@NScriptType|@NModuleScope/.test(header)) return header;
  return null;
}

function findTsSource(jsPath) {
  // JS path: src/FileCabinet/SuiteScripts/multicard-api/module/file.js
  // TS path: src/TypeScripts/multicard-api/module/file.ts
  const relative = path.relative(JS_ROOT, jsPath);
  const tsPath = path.join(TS_ROOT, relative).replace(/\.js$/, '.ts');

  if (fs.existsSync(tsPath)) return tsPath;

  // Try .tsx if .ts doesn't exist
  const tsxPath = tsPath.replace(/\.ts$/, '.tsx');
  if (fs.existsSync(tsxPath)) return tsxPath;

  return null;
}

function injectHeader(jsPath) {
  const tsPath = findTsSource(jsPath);
  if (!tsPath) return { status: 'skipped', reason: 'no matching .ts source' };

  const header = extractHeader(tsPath);
  if (!header) return { status: 'skipped', reason: 'no JSDoc header in source' };

  let jsContent = fs.readFileSync(jsPath, 'utf8');

  // Check if header already injected
  if (jsContent.startsWith(header)) return { status: 'skipped', reason: 'already present' };

  jsContent = header + '\n' + jsContent;
  fs.writeFileSync(jsPath, jsContent, 'utf8');
  return { status: 'injected' };
}

// --- Main ---
const jsRoot = path.resolve(JS_ROOT);
if (!fs.existsSync(jsRoot)) {
  console.error(`Output directory not found: ${jsRoot}`);
  console.error('Run tsc first.');
  process.exit(1);
}

const results = { injected: 0, skipped: 0, errors: 0 };

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      try {
        const result = injectHeader(fullPath);
        if (result.status === 'injected') {
          results.injected++;
          console.log(`  ✅ ${path.relative(process.cwd(), fullPath)}`);
        } else {
          results.skipped++;
        }
      } catch (err) {
        results.errors++;
        console.error(`  ❌ ${path.relative(process.cwd(), fullPath)}: ${err.message}`);
      }
    }
  }
}

console.log('🔧 Injecting JSDoc headers to compiled JavaScript...\n');
walk(jsRoot);
console.log(
  `\n✅ Done. ${results.injected} injected, ${results.skipped} skipped, ${results.errors} errors.`,
);
if (results.errors > 0) process.exit(1);
