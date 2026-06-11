// Test runner: node tools/test/run.mjs [substring-filter]
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suites, AssertionError } from './harness.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => f.includes(filter))
  .sort();

for (const f of files) {
  await import(`./${f}`);
}

let passed = 0;
const failures = [];

for (const s of suites) {
  let suiteFailed = 0;
  for (const t of s.tests) {
    try {
      await t.fn();
      passed++;
    } catch (err) {
      suiteFailed++;
      failures.push({ suite: s.name, test: t.name, err });
    }
  }
  const mark = suiteFailed === 0 ? 'ok  ' : 'FAIL';
  console.log(`${mark}  ${s.name}  (${s.tests.length - suiteFailed}/${s.tests.length})`);
}

for (const f of failures) {
  console.error(`\n--- ${f.suite} :: ${f.test}`);
  console.error(f.err instanceof AssertionError ? f.err.message : f.err.stack || String(f.err));
}

console.log(`\n${passed} passed, ${failures.length} failed (${files.length} file(s))`);
process.exit(failures.length ? 1 : 0);
