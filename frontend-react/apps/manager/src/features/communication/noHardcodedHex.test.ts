import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// M4 — Règle : aucun hex couleur en dur dans les .tsx du Communication Center
// (les couleurs viennent des tokens --bs-* du thème panel).
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;

describe('Communication Center — pas de hex en dur dans les .tsx', () => {
  it('aucun fichier .tsx ne contient de couleur hexadécimale', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const tsxFiles = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'));
    const offenders: string[] = [];
    for (const file of tsxFiles) {
      const content = readFileSync(join(dir, file), 'utf8');
      if (HEX_COLOR.test(content)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
