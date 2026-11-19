#!/usr/bin/env node
/**
 * Hook SessionStart do Antigravity (.agents/hooks.json).
 * Injeta resumo compacto do projeto (~1,5–3 mil tokens) no início de cada sessão ou após /clear,
 * evitando leitura integral de HANDOFF.md, PROGRESS.md e GAME_STUDY.md.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readText(rel) {
  const p = resolve(root, rel);
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : '';
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

try {
  const handoff = readText('docs/HANDOFF.md');
  const progress = readText('docs/PROGRESS.md');
  const pending = progress
    ? progress
        .split(/\r?\n/)
        .map((line, i) => ({ line, num: i + 1 }))
        .filter(({ line }) => /^- \[ \]/.test(line))
        .slice(0, 30)
        .map(({ line, num }) => `${num}:${line.slice(0, 150)}`)
        .join('\n')
    : '';

  const gitLog = git(['log', '--oneline', '-6']);
  const gitStatus = git(['status', '--short']).split(/\r?\n/).slice(0, 10).join('\n');

  const parts = [
    '=== ESTADO DO PROJETO (scripts/hooks/session-start.mjs) ===',
    'Regra de economia: NÃO leia docs/HANDOFF.md, docs/PROGRESS.md ou docs/GAME_STUDY.md inteiros. Use este resumo, Grep e read_file com StartLine/EndLine.',
    '',
    '--- docs/HANDOFF.md ---',
    handoff || '(vazio)',
    '',
    '--- Pendências abertas em docs/PROGRESS.md (linhas "- [ ]", cortadas) ---',
    pending || '(nenhuma)',
    '',
    '--- git ---',
    gitLog || '(sem commits)',
  ];
  if (gitStatus) parts.push('', 'status:', gitStatus);

  const payload = {
    injectSteps: [
      {
        systemMessage: {
          systemMessage: parts.join('\n'),
        },
      },
    ],
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
} catch {
  process.stdout.write('{}\n');
}
