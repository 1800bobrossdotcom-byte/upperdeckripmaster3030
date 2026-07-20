#!/usr/bin/env node
// Read each curated card image with Claude (vision) and generate the "living
// dossier" on the back of the card: lore + statistical provenance seed.
// Claude reads the card art directly — no separate OCR step needed.
//
//   npm install @anthropic-ai/sdk           # one-time
//   export ANTHROPIC_API_KEY=sk-ant-...     # or: ant auth login
//   node scripts/generate-lore.mjs                 # all cards missing lore
//   node scripts/generate-lore.mjs --slug the-vine # one card
//   node scripts/generate-lore.mjs --force         # regenerate everything
//
// Writes cards/data/<slug>.json. The card page's back face renders it and
// layers live chain reads on top (gas → trigger status, block ticker).

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '..');
const cardsDir = join(rootDir, 'cards');
const artDir = join(cardsDir, 'art');
const dataDir = join(cardsDir, 'data');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) {
    const k = process.argv[i].slice(2);
    const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
    args[k] = v;
  }
}

let Anthropic;
try {
  ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
} catch {
  console.error('Missing dependency. Run:  npm install @anthropic-ai/sdk');
  console.error('Then set ANTHROPIC_API_KEY (or run `ant auth login`).');
  process.exit(1);
}

// Resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an `ant auth login` profile.
const client = new Anthropic();

const MEDIA = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

// Structured output — Claude returns exactly this shape (Opus 4.8 supports output_config.format).
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'character', 'lore', 'omen', 'rarity'],
  properties: {
    title: { type: 'string', description: 'A short evocative card title, 1-4 words. Title case.' },
    character: { type: 'string', description: 'Best guess at who or what the figure is, in plain words (e.g. "a grinning cartoon cat", "a fat plumber with a pickaxe barbell"). Do NOT name any trademarked character.' },
    lore: { type: 'string', description: '2-3 sentences of mythic, psychedelic trading-card lore for the figure. Playful, ominous, cosmic. No real brand or character names.' },
    omen: { type: 'string', description: 'A single cryptic one-line omen or catchphrase, under 12 words.' },
    rarity: { type: 'string', enum: ['common', 'uncommon', 'rare', 'mythic', 'prizm'], description: 'Your read on how strange/striking the card is.' },
  },
};

const SYSTEM = `You are the lore-keeper for "upperdeckripmaster3030", a psychedelic hyperfoil trading-card game of wild old cartoon spirits. You are shown one card's artwork. Read whatever printed name, number, or stats appear on the card, then write living lore for it. Rules: playful, cosmic, blacklight-psychedelic tone; never use a real trademarked character name or brand (describe the figure generically instead); keep it short. Return only the structured object.`;

function listArt() {
  if (!existsSync(artDir)) return [];
  return readdirSync(artDir).filter(f => MEDIA[extname(f).toLowerCase()]);
}

async function generateFor(file) {
  const slug = file.replace(extname(file), '');
  const outPath = join(dataDir, `${slug}.json`);
  if (existsSync(outPath) && !args.force) return { slug, skipped: true };

  const b64 = readFileSync(join(artDir, file)).toString('base64');
  const media = MEDIA[extname(file).toLowerCase()];

  const resp = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: media, data: b64 } },
        { type: 'text', text: 'Read this card and write its living lore.' },
      ],
    }],
  });

  if (resp.stop_reason === 'refusal') return { slug, error: 'refusal' };
  const text = resp.content.find(b => b.type === 'text')?.text || '{}';
  const lore = JSON.parse(text);

  // Merge with any existing provenance so re-runs don't wipe accumulated stats.
  const prior = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};
  const record = {
    slug,
    ...lore,
    generatedBy: 'claude-opus-4-8',
    provenance: prior.provenance || {
      minted: null, mintPrice: null, lastSale: null, floor: null,
      battlesWon: 0, battlesLost: 0, timesWagered: 0, burnsSurvived: 0,
      owners: [],
    },
  };
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(record, null, 2));
  return { slug, title: lore.title, rarity: lore.rarity };
}

const files = args.slug
  ? listArt().filter(f => f.replace(extname(f), '') === args.slug)
  : listArt();

if (!files.length) { console.error('No card art found in cards/art/. Ingest cards first.'); process.exit(1); }

console.log(`Generating lore for ${files.length} card(s) with claude-opus-4-8…\n`);
let ok = 0, skip = 0, err = 0;
for (const f of files) {
  try {
    const r = await generateFor(f);
    if (r.skipped) { skip++; console.log(`  · ${r.slug} (has lore, skipping — use --force to redo)`); }
    else if (r.error) { err++; console.log(`  ✗ ${r.slug} (${r.error})`); }
    else { ok++; console.log(`  ✦ ${r.slug} — "${r.title}" [${r.rarity}]`); }
  } catch (e) {
    err++; console.log(`  ✗ ${f}: ${e.message}`);
  }
}
console.log(`\n✦ ${ok} generated, ${skip} skipped, ${err} errored → cards/data/`);
