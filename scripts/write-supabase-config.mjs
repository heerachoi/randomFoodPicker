import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env');
const outPath = resolve(root, 'supabase-config.js');

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

let env = {};
try {
  env = parseEnv(await readFile(envPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || env.SUPABASE_ANON_KEY
  || '';

const source = `// Generated from .env by scripts/write-supabase-config.mjs — do not edit by hand.
export const SUPABASE_URL = ${JSON.stringify(url)};
export const SUPABASE_ANON_KEY = ${JSON.stringify(key)};
`;

await writeFile(outPath, source);
if (!url || !key) {
  console.warn('supabase-config.js 생성: .env에 URL/키가 비어 있습니다. 로컬 저장 모드로 동작합니다.');
} else {
  console.log('supabase-config.js 를 .env 값으로 갱신했습니다.');
}
