exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in Netlify environment variables.' }) };
  }

  let imageData;
  try {
    ({ imageData } = JSON.parse(event.body));
    if (!imageData) throw new Error('missing');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request — imageData required.' }) };
  }

  const prompt = `You are an expert trading card identifier and price analyst with deep knowledge of Pokémon, Magic: The Gathering, Yu-Gi-Oh!, sports cards (NBA, MLB, NFL, soccer), and other TCGs.

Analyze the card in this image and return ONLY a raw JSON object — no markdown fences, no preamble, no explanation.

{
  "card_name": "Full official card name",
  "game": "Pokémon | Magic: The Gathering | Yu-Gi-Oh | Sports | Other",
  "set": "Set or series name",
  "year": "Release year as string",
  "card_number": "Card number if visible, otherwise null",
  "rarity": "Common | Uncommon | Rare | Holo Rare | Ultra Rare | Secret Rare | Legendary | etc.",
  "condition_estimate": "Poor | Heavily Played | Played | Lightly Played | Near Mint | Mint | Gem Mint",
  "condition_score": <integer 1-100>,
  "price_low": "$X.XX",
  "price_mid": "$X.XX",
  "price_high": "$X.XX",
  "confidence": "high | medium | low",
  "notes": "1-2 sentences covering notable variants, print errors, first editions, or key pricing factors."
}

If the image does not show a recognizable trading card, return exactly:
{ "error": "not_a_card", "notes": "Brief description of what was seen." }`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageData } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      return { statusCode: response.status, body: JSON.stringify({ error: `Anthropic error ${response.status}`, detail: txt }) };
    }

    const data = await response.json();
    const raw = data.content.map(b => b.text || '').join('').trim();
    const clean = raw.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();

    // Validate JSON before sending
    const parsed = JSON.parse(clean);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Analysis failed', detail: err.message }) };
  }
};
