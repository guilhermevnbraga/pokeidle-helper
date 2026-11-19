#!/usr/bin/env node
/**
 * Compacta docs/PROGRESS.md: cada item "- [x]"/"- [ ]" fica em 1 linha curta
 * (título + 1ª frase + ressalva "NÃO validado/testado/confirmado").
 * Uso: node scripts/compact-progress.mjs [--max 190] docs/PROGRESS.md
 * Idempotente: linhas já curtas não mudam.
 */
import { readFileSync, writeFileSync } from 'node:fs';

let maxLen = 190;
const args = process.argv.slice(2);
if (args[0] === '--max') {
  maxLen = parseInt(args[1], 10) || 190;
  args.splice(0, 2);
}
const path = args[0] || 'docs/PROGRESS.md';

const raw = readFileSync(path, 'utf8');
const nl = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.replace(/\r\n/g, '\n').split('\n');

function shorten(line) {
  if (line.length <= maxLen || !/^- \[[ x]\]/.test(line)) return line;
  let caveat = '';
  const m = line.match(/NÃO (?:validado|testado|confirmado)[^.;]*/);
  if (m) caveat = ' · ' + m[0].slice(0, 110).replace(/[ ,]+$/, '');
  const head = m ? line.slice(0, m.index) : line;

  let cut = null;
  const re = /(?<=[a-zA-ZÀ-ÿ0-9)\]`*])\. /g;
  for (const hit of head.matchAll(re)) {
    if (hit.index >= 90) {
      cut = hit.index + 1;
      break;
    }
  }
  const budget = Math.max(40, maxLen - caveat.length);
  const trimmed =
    cut === null || cut > budget
      ? head.slice(0, budget).replace(/[ ,;:(]+$/, '') + '…'
      : head.slice(0, cut);
  return trimmed + caveat;
}

const out = lines.map(shorten).join(nl);
writeFileSync(path, out, 'utf8');
console.log(`${path}: ${Buffer.byteLength(raw, 'utf8')} -> ${Buffer.byteLength(out, 'utf8')} bytes`);
