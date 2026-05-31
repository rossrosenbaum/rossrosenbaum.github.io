const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

async function readState(scope, page) {
  const { data, error } = await supabase
    .from('states')
    .select('states')
    .eq('scope', scope)
    .eq('page', page)
    .maybeSingle();

  if (error) {
    console.error('Failed to read state', error);
    return {};
  }

  return (data && data.states) || {};
}

async function saveState(scope, page, states) {
  const { error } = await supabase
    .from('states')
    .upsert({ scope, page, states }, { onConflict: ['scope', 'page'] });

  if (error) {
    console.error('Failed to save state', error);
    return false;
  }

  return true;
}

async function readLeaderboard() {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('name, hotdogs, timestamp')
    .order('hotdogs', { ascending: false });

  if (error) {
    console.error('Failed to read leaderboard', error);
    return [];
  }

  return data || [];
}

async function writeLeaderboard(entry) {
  const { error } = await supabase
    .from('leaderboard')
    .upsert(entry, { onConflict: ['name'] });

  if (error) {
    console.error('Failed to write leaderboard entry', error);
    return false;
  }

  return true;
}

app.get('/api/state', async (req, res) => {
  const { page, key } = req.query;
  if (!page) {
    return res.status(400).json({ error: 'page query param required' });
  }

  const scope = key || 'global';
  const states = await readState(scope, page);
  res.json({ states });
});

app.post('/api/state', async (req, res) => {
  const { page, key, states } = req.body || {};
  if (!page || typeof states === 'undefined') {
    return res.status(400).json({ error: 'page and states are required in body' });
  }

  const scope = key || 'global';
  if (!await saveState(scope, page, states)) {
    return res.status(500).json({ error: 'Failed to persist state' });
  }

  res.json({ ok: true });
});

app.get('/api/leaderboard', async (req, res) => {
  const entries = await readLeaderboard();
  res.json({ entries });
});

app.post('/api/leaderboard', async (req, res) => {
  const { name, hotdogs } = req.body || {};
  if (!name || typeof hotdogs === 'undefined') {
    return res.status(400).json({ error: 'name and hotdogs are required in body' });
  }

  const normalizedName = String(name).trim().substring(0, 20);
  const entry = {
    name: normalizedName,
    hotdogs: Number(hotdogs),
    timestamp: new Date().toISOString()
  };

  if (!await writeLeaderboard(entry)) {
    return res.status(500).json({ error: 'Failed to persist leaderboard entry' });
  }

  const entries = await readLeaderboard();
  res.json({ ok: true, entries });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  console.log('Access URLs:');
  console.log(`  Local:     http://localhost:${PORT}`);

  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  Network:   http://${net.address}:${PORT}`);
      }
    }
  }
});
