// Minimal test harness. Browser scripts (classic, window.DS namespace) are
// executed inside a vm sandbox so Node tests exercise the exact files the
// site ships.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadDS(relPaths) {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const rel of relPaths) {
    const file = path.join(ROOT, rel);
    const code = readFileSync(file, 'utf8');
    vm.runInContext(code, sandbox, { filename: rel });
  }
  return sandbox.DS;
}

export const suites = [];
let current = null;

export function suite(name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

export function test(name, fn) {
  if (!current) throw new Error('test() outside suite()');
  current.tests.push({ name, fn });
}

export class AssertionError extends Error {}

function fail(msg) {
  throw new AssertionError(msg);
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

export function close(actual, expected, eps = 1e-9, msg = '') {
  if (typeof actual !== 'number' || Math.abs(actual - expected) > eps)
    fail(`${msg}\n  expected ~${expected}, actual ${actual}`);
}

export function ok(cond, msg = 'expected truthy') {
  if (!cond) fail(msg);
}

export function throws(fn, msg = 'expected function to throw') {
  try {
    fn();
  } catch {
    return;
  }
  fail(msg);
}
