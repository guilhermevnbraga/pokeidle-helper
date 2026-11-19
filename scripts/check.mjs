#!/usr/bin/env node
/**
 * Verificação local do pokeidle-helper (zero dependências externas):
 * 1. Valida JSONs de configuração (manifest.json + arquivos .agents/*.json) e referências do MV3.
 * 2. Checa sintaxe JS (`node --check`) de todos os scripts .js/.mjs.
 * 3. Roda testes unitários (`node --test tests/*.test.mjs`).
 * 4. Avisa se docs/HANDOFF.md passou do teto econômico de 6 KB.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'deploy', 'archive']);
const errors = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function checkJson(rel) {
  const full = resolve(root, rel);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (e) {
    errors.push(`JSON inválido em ${rel}: ${e.message}`);
    return null;
  }
}

// 1. manifest.json e JSONs do .agents/
const manifest = checkJson('manifest.json');
if (manifest) {
  if (manifest.manifest_version !== 3) errors.push('manifest.json: manifest_version deve ser 3');
  const refs = [];
  if (manifest.background?.service_worker) refs.push(manifest.background.service_worker);
  for (const cs of manifest.content_scripts || []) {
    for (const f of cs.js || []) refs.push(f);
    for (const f of cs.css || []) refs.push(f);
  }
  for (const ref of refs) {
    if (!existsSync(resolve(root, ref))) errors.push(`manifest.json referencia arquivo ausente: ${ref}`);
  }
}

for (const cfg of [
  '.agents/hooks.json',
  '.agents/plugins/chrome-browser/plugin.json',
  '.agents/plugins/chrome-browser/mcp_config.json',
]) {
  checkJson(cfg);
}

// 2. Sintaxe JS em todos os .js e .mjs
const allFiles = walk(root);
const jsFiles = allFiles.filter(f => ['.js', '.mjs'].includes(extname(f)));
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    errors.push(`Sintaxe em ${relative(root, file)}:\n${(e.stderr || e.message).toString().trim()}`);
  }
}

// 3. Testes unitários (node:test nativo)
const testDir = resolve(root, 'tests');
const testFiles = existsSync(testDir)
  ? readdirSync(testDir).filter(f => f.endsWith('.test.mjs') || f.endsWith('.test.js')).map(f => join(testDir, f))
  : [];

if (testFiles.length) {
  try {
    execFileSync(process.execPath, ['--test', ...testFiles], { cwd: root, stdio: 'inherit' });
  } catch {
    errors.push('Testes unitários falharam.');
  }
}

// 4. Alerta de orçamento de contexto em HANDOFF.md
const handoffPath = resolve(root, 'docs/HANDOFF.md');
if (existsSync(handoffPath)) {
  const bytes = statSync(handoffPath).size;
  if (bytes > 6144) {
    console.warn(`AVISO: docs/HANDOFF.md tem ${bytes} bytes (> 6144). Arquive o excesso em docs/archive/ no próximo /handoff.`);
  }
}

if (errors.length) {
  console.error('\nCHECK FALHOU:\n- ' + errors.join('\n- '));
  process.exit(1);
}

console.log(`check: ${jsFiles.length} arquivos JS, manifest MV3 e ${testFiles.length} suite(s) de teste -> OK`);
