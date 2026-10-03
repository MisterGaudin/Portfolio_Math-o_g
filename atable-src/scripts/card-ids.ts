// Génère public/cards/README.md : la liste des noms de fichiers attendus pour les illustrations.
// Usage : npx vite-node scripts/card-ids.ts
import { writeFileSync } from 'node:fs';
import { CARD_IMAGE_EXT, REGIONS } from '../src/config/cards';
import { regionCards } from '../src/engine';

const ext = CARD_IMAGE_EXT;
const lines = [
  '# Illustrations des cartes',
  '',
  `Dépose ici une image par carte, nommée par l'identifiant de la carte (format \`.${ext}\`, réglable dans \`src/config/cards.ts\`).`,
  "Une image absente est simplement remplacée par la carte provisoire. Proportions conseillées : 2 × 3 (par ex. 400 × 580 px).",
  '',
  '## Cartes spéciales',
  '',
  `- \`baguette.${ext}\` — Baguette (joker)`,
  `- \`vaisselle.${ext}\` — Vaisselle`,
  `- \`back.${ext}\` — dos des cartes`,
  '',
  '## Cartes Région secrètes',
  '',
  ...REGIONS.map((r) => `- \`region-${r.id}.${ext}\` — ${r.name}`),
  '',
  '## Spécialités',
  '',
  ...REGIONS.flatMap((r) => [`### ${r.name}`, '', ...regionCards(r.id).map((c) => `- \`${c.id}.${ext}\` — ${c.name}`), '']),
];
writeFileSync(new URL('../public/cards/README.md', import.meta.url), lines.join('\n'));
console.log('public/cards/README.md généré.');
