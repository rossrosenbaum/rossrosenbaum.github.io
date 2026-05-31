const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'states.json');
const LEADERBOARD_FILE = path.join(__dirname, 'data', 'leaderboard.json');

app.use(bodyParser.json());

// Serve static site files from project root
app.use(express.static(path.join(__dirname)));

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}

function writeData(data) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write data file', e);
  }
}

function readLeaderboard() {
  try {
    return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

function writeLeaderboard(entries) {
  try {
    fs.mkdirSync(path.dirname(LEADERBOARD_FILE), { recursive: true });
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write leaderboard file', e);
  }
}

// GET saved state for a given page + key (password hash)
app.get('/api/state', (req, res) => {
  const { page, key } = req.query;
  if (!page) {
    return res.status(400).json({ error: 'page query param required' });
  }
  const data = readData();
  // Use key (password hash) as scope for the state
  const scope = key || 'global';
  const states = (data[scope] && data[scope][page]) || {};
  res.json({ states });
});

// POST save state
app.post('/api/state', (req, res) => {
  const { page, key, states } = req.body || {};
  if (!page || typeof states === 'undefined') {
    return res.status(400).json({ error: 'page and states are required in body' });
  }
  const data = readData();
  // Use key (password hash) as scope for the state
  const scope = key || 'global';
  if (!data[scope]) data[scope] = {};
  data[scope][page] = states;
  writeData(data);
  res.json({ ok: true });
});

// GET leaderboard
app.get('/api/leaderboard', (req, res) => {
  const entries = readLeaderboard();
  res.json({ entries });
});

// POST leaderboard entry
app.post('/api/leaderboard', (req, res) => {
  const { name, hotdogs } = req.body || {};
  if (!name || typeof hotdogs === 'undefined') {
    return res.status(400).json({ error: 'name and hotdogs are required in body' });
  }
  const entries = readLeaderboard();
  const normalizedName = String(name).trim().substring(0, 20);
  const existingIndex = entries.findIndex(entry => entry.name.toLowerCase() === normalizedName.toLowerCase());
  const newEntry = {
    name: normalizedName,
    hotdogs: Number(hotdogs),
    timestamp: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    entries[existingIndex] = newEntry;
  } else {
    entries.push(newEntry);
  }

  writeLeaderboard(entries);
  res.json({ ok: true, entries });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  console.log('Access URLs:');
  console.log(`  Local:     http://localhost:${PORT}`);
  // Get local IP address
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  Network:   http://${net.address}:${PORT}`);
      }
    }
  }
});
