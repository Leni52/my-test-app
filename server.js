require('dotenv').config();
const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from .env

app.post('/api/tips', async (req, res) => {
  const { weather } = req.body;
  if (!weather) {
    return res.status(400).json({ error: 'weather payload required' });
  }

  const prompt =
    `You are a friendly weather advisor. Current conditions in ${weather.name}, ${weather.country}:\n` +
    `- Temperature: ${weather.temp}°C (feels like ${weather.feels}°C)\n` +
    `- Condition: ${weather.desc}\n` +
    `- Humidity: ${weather.humidity}%\n` +
    `- Wind: ${weather.wind} m/s\n\n` +
    `Produce exactly 6 short practical tips for someone going outside today.\n` +
    `Reply ONLY with a valid JSON array, no markdown, no preamble:\n` +
    `[{"icon":"<single emoji>","color":"blue|amber|green|coral|teal|purple","title":"3-4 word title","tip":"One actionable sentence."}]\n` +
    `Color: blue=clothing/layers, amber=sun/UV, green=activity/health, coral=caution, teal=accessories, purple=misc.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content
      .map(b => b.text || '')
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const tips = JSON.parse(raw);
    res.json({ tips });
  } catch (e) {
    console.error('Tips error:', e.message);
    const status = e.status ?? 500;
    const message =
      status === 401 ? 'Invalid or missing ANTHROPIC_API_KEY.' :
      status === 429 ? 'Anthropic rate limit reached — try again shortly.' :
      `Failed to generate tips: ${e.message}`;
    res.status(status).json({ error: message });
  }
});

// In production, serve the React build and let it handle all non-API routes.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'build')));
  app.get('*', (_req, res) =>
    res.sendFile(path.join(__dirname, 'build', 'index.html'))
  );
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Tips API listening on :${PORT}`));
