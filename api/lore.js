// Vercel serverless function — generates a card's living lore on demand using
// the ANTHROPIC_API_KEY you set in the Vercel project. Claude reads the card
// art directly (vision) — no separate OCR. Edge-cached hard so a given card
// only costs one API call until its art changes.
//
//   GET /api/lore?slug=the-card-01  ->  { title, character, lore, omen, rarity, provenance }
//
// The card back tries the committed cards/data/<slug>.json first (stable,
// curated, free) and only falls back to this function when a card has no lore
// yet. Commit generated JSON (npm run lore) when you want it permanent.

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the Vercel env

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'character', 'lore', 'omen', 'rarity'],
  properties: {
    title: { type: 'string', description: 'Short evocative card title, 1-4 words, Title Case.' },
    character: { type: 'string', description: 'Plain description of the figure (e.g. "a grinning cartoon cat"). No trademarked names.' },
    lore: { type: 'string', description: '2-3 sentences of mythic, psychedelic trading-card lore. No real brand/character names.' },
    omen: { type: 'string', description: 'A cryptic one-line omen, under 12 words.' },
    rarity: { type: 'string', enum: ['common', 'uncommon', 'rare', 'mythic', 'prizm'] },
  },
};

const SYSTEM = `You are the lore-keeper for "upperdeckripmaster3030", a psychedelic hyperfoil trading-card game of wild old cartoon spirits. You are shown one card's artwork. Read whatever printed name/number/stats appear, then write living lore. Rules: playful, cosmic, blacklight-psychedelic tone; never use a real trademarked character name or brand (describe the figure generically); keep it short. Return only the structured object.`;

export default async function handler(req, res) {
  const slug = String(req.query.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) return res.status(400).json({ error: 'slug required' });

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const imgUrl = `${proto}://${host}/cards/art/${slug}.webp`;

  try {
    const imgResp = await fetch(imgUrl);
    if (!imgResp.ok) return res.status(404).json({ error: 'card art not found', tried: imgUrl });
    const b64 = Buffer.from(await imgResp.arrayBuffer()).toString('base64');

    const resp = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: "image/webp", data: b64 } },
          { type: 'text', text: 'Read this card and write its living lore.' },
        ],
      }],
    });

    if (resp.stop_reason === 'refusal') return res.status(200).json({ slug, lore: 'This spirit declines to be read.', omen: '', rarity: 'common' });
    const lore = JSON.parse(resp.content.find(b => b.type === 'text')?.text || '{}');

    // Edge-cache: one API call per card per day; served instantly thereafter.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({
      slug, ...lore,
      generatedBy: 'claude-opus-4-8',
      provenance: { minted: null, mintPrice: null, lastSale: null, floor: null, battlesWon: 0, battlesLost: 0, timesWagered: 0, burnsSurvived: 0, owners: [] },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
