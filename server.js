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

let supabase = null;
let usingSupabase = false;
const stateStore = new Map();
const leaderboardStore = new Map();

function normalizeName(name) {
  return String(name || '').trim().substring(0, 20);
}

function getStateKey(scope, page) {
  return `${scope || 'global'}:${page}`;
}

function hasUsableSupabaseConfig(url, key) {
  if (!url || !key) {
    return false;
  }

  const normalizedUrl = String(url).trim().toLowerCase();
  const normalizedKey = String(key).trim().toLowerCase();
  return !normalizedUrl.includes('your-') && !normalizedKey.includes('your-') && !normalizedKey.includes('placeholder') && !normalizedUrl.includes('example');
}

if (hasUsableSupabaseConfig(SUPABASE_URL, SUPABASE_KEY)) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    usingSupabase = true;
  } catch (error) {
    console.warn('Supabase client initialization failed; falling back to in-memory storage', error.message);
  }
} else {
  console.warn('Supabase not configured or using placeholder values; using in-memory storage for local testing');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

async function readState(scope, page) {
  if (!usingSupabase || !supabase) {
    return stateStore.get(getStateKey(scope, page)) || {};
  }

  try {
    const { data, error } = await supabase
      .from('states')
      .select('states')
      .eq('scope', scope)
      .eq('page', page)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data && data.states) || {};
  } catch (error) {
    console.warn('Supabase unavailable for state read; falling back to in-memory storage', error.message);
    usingSupabase = false;
    supabase = null;
    return stateStore.get(getStateKey(scope, page)) || {};
  }
}

async function saveState(scope, page, states) {
  if (!usingSupabase || !supabase) {
    stateStore.set(getStateKey(scope, page), states);
    return true;
  }

  try {
    const { error } = await supabase
      .from('states')
      .upsert({ scope, page, states }, { onConflict: ['scope', 'page'] });

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.warn('Supabase unavailable for state save; falling back to in-memory storage', error.message);
    usingSupabase = false;
    supabase = null;
    stateStore.set(getStateKey(scope, page), states);
    return true;
  }
}

async function readLeaderboard() {
  if (!usingSupabase || !supabase) {
    return Array.from(leaderboardStore.values()).sort((a, b) => b.hotdogs - a.hotdogs);
  }

  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('name, hotdogs, timestamp')
      .order('hotdogs', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.warn('Supabase unavailable for leaderboard read; falling back to in-memory storage', error.message);
    usingSupabase = false;
    supabase = null;
    return Array.from(leaderboardStore.values()).sort((a, b) => b.hotdogs - a.hotdogs);
  }
}

async function findLeaderboardEntryByNameInsensitive(name) {
  if (!usingSupabase || !supabase) {
    const normalizedName = normalizeName(name).toLowerCase();
    return Array.from(leaderboardStore.values()).find((entry) => normalizeName(entry.name).toLowerCase() === normalizedName) || null;
  }

  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('name, hotdogs, timestamp')
      .ilike('name', name)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  } catch (error) {
    console.warn('Supabase unavailable for leaderboard lookup; falling back to in-memory storage', error.message);
    usingSupabase = false;
    supabase = null;
    const normalizedName = normalizeName(name).toLowerCase();
    return Array.from(leaderboardStore.values()).find((entry) => normalizeName(entry.name).toLowerCase() === normalizedName) || null;
  }
}

async function writeLeaderboard(entry) {
  const normalizedName = normalizeName(entry.name);
  const normalizedEntry = { ...entry, name: normalizedName, timestamp: entry.timestamp || new Date().toISOString() };

  if (!usingSupabase || !supabase) {
    const existingEntry = await findLeaderboardEntryByNameInsensitive(normalizedName);
    if (existingEntry) {
      leaderboardStore.set(normalizeName(existingEntry.name).toLowerCase(), normalizedEntry);
    } else {
      leaderboardStore.set(normalizedName.toLowerCase(), normalizedEntry);
    }
    return true;
  }

  try {
    const existingEntry = await findLeaderboardEntryByNameInsensitive(normalizedName);
    if (existingEntry) {
      const { error } = await supabase
        .from('leaderboard')
        .update({ hotdogs: normalizedEntry.hotdogs, timestamp: normalizedEntry.timestamp })
        .eq('name', existingEntry.name);

      if (error) {
        throw error;
      }

      return true;
    }

    const { error } = await supabase
      .from('leaderboard')
      .insert(normalizedEntry);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.warn('Supabase unavailable for leaderboard write; falling back to in-memory storage', error.message);
    usingSupabase = false;
    supabase = null;
    const existingEntry = await findLeaderboardEntryByNameInsensitive(normalizedName);
    if (existingEntry) {
      leaderboardStore.set(normalizeName(existingEntry.name).toLowerCase(), normalizedEntry);
    } else {
      leaderboardStore.set(normalizedName.toLowerCase(), normalizedEntry);
    }
    return true;
  }
}

async function deleteLeaderboardEntryByName(name) {
  const normalizedName = normalizeName(name);
  if (!usingSupabase || !supabase) {
    for (const [key, entry] of leaderboardStore.entries()) {
      if (normalizeName(entry.name).toLowerCase() === normalizedName.toLowerCase()) {
        leaderboardStore.delete(key);
        break;
      }
    }
    return true;
  }

  try {
    const { error } = await supabase
      .from('leaderboard')
      .delete()
      .ilike('name', normalizedName);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.warn('Supabase unavailable for leaderboard delete; falling back to in-memory storage', error.message);
    usingSupabase = false;
    supabase = null;
    for (const [key, entry] of leaderboardStore.entries()) {
      if (normalizeName(entry.name).toLowerCase() === normalizedName.toLowerCase()) {
        leaderboardStore.delete(key);
        break;
      }
    }
    return true;
  }
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

app.delete('/api/leaderboard/:name', async (req, res) => {
  const { name } = req.params;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  if (!await deleteLeaderboardEntryByName(name)) {
    return res.status(500).json({ error: 'Failed to delete leaderboard entry' });
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
