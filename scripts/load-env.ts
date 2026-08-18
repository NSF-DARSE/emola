/**
 * Minimal .env loader. Handles the two things that trip up a naive split: a
 * UTF-8 BOM on the first line, and values containing '=' (the Bedrock key ends
 * in base64 padding, so splitting on every '=' truncates it to nothing).
 */
import fs from 'node:fs';

export function loadEnv(file = '.env'): void {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i <= 0) continue;
    const key = trimmed.slice(0, i).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    process.env[key] ??= trimmed.slice(i + 1).trim();
  }
}
