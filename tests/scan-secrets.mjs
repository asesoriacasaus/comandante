// Falla si algún archivo versionado parece contener una clave o un token (PLAN 5.1).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  ['Clave de Google/Gemini', /AIza[0-9A-Za-z_-]{35}/],
  ['Clave tipo sk-', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['Token OAuth de Google', /\bya29\.[0-9A-Za-z_-]{20,}/],
  ['Refresh token de Google', /\b1\/\/[0-9A-Za-z_-]{30,}/],
  ['Clave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Token de GitHub', /\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/],
  ['Asignación de secreto con valor largo', /(token|secret|api[_-]?key|password)["']?\s*[:=]\s*["'][A-Za-z0-9_\-+/=]{40,}["']/i]
];

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
let bad = 0;
for (const f of files) {
  if (/\.(png|jpe?g|webp|ico|zip)$/i.test(f)) continue;
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of PATTERNS) {
      if (re.test(line)) { bad++; console.error(`${f}:${i + 1}: posible secreto (${name})`); }
    }
  });
}
if (bad) { console.error(`\n${bad} coincidencia(s). No se muestra el valor.`); process.exit(1); }
console.log(`Sin secretos en ${files.length} archivos.`);
