require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const db = require('./database');
const { requireAuth, checkPassword, SESSION_SECRET } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));

// Auth endpoints (avant le middleware)
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (checkPassword(password)) {
    const maxAge = 30 * 24 * 60 * 60; // 30 jours en secondes
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `lifecrm_auth=${SESSION_SECRET}; HttpOnly${secure}; Path=/; Max-Age=${maxAge}; SameSite=Lax`);
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.get('/api/auth/check', (req, res) => {
  const authCookie = req.headers.cookie?.split(';')
    .find(c => c.trim().startsWith('lifecrm_auth='))
    ?.split('=')[1];
  res.json({ authenticated: authCookie === SESSION_SECRET });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'lifecrm_auth=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// Middleware d'authentification (protège TOUT sauf login, auth API, et cron)
app.use((req, res, next) => {
  // Exclure login.html, auth API, cron endpoints, et assets statiques
  const isPublicAsset = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/i.test(req.path);
  const isLoginPage = req.path === '/login.html';
  const isAuthAPI = req.path.startsWith('/api/auth/');
  const isCronAPI = req.path.startsWith('/api/cron/');
  
  if (isPublicAsset || isLoginPage || isAuthAPI || isCronAPI) {
    return next();
  }
  
  // Vérifier le cookie
  const authCookie = req.headers.cookie?.split(';')
    .find(c => c.trim().startsWith('lifecrm_auth='))
    ?.split('=')[1];

  if (authCookie === SESSION_SECRET) {
    return next();
  }

  // Non authentifié
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Rediriger vers login
  res.redirect('/login.html');
});

// Servir les fichiers statiques APRÈS l'auth
app.use(express.static(path.join(__dirname, 'public')));

// Init schema
db.initSchema().catch((e) => console.error('Init error:', e));

// ---------- Helpers ----------
function isoDate(d = new Date()) {
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    const err = new Error(`Missing env: ${missing.join(', ')}`);
    err.statusCode = 500;
    throw err;
  }
}

// ---------- Health ----------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ---------- Dashboard ----------
app.get('/api/dashboard', async (req, res) => {
  try {
    const stats = await db.getDashboardStats();
    const settings = await db.getAllSettings();

    // Alerts (simple rules)
    const alerts = [];
    const weeklyBudget = parseFloat(settings.weekly_budget || '0');
    if (weeklyBudget && stats.expenses_week > weeklyBudget) alerts.push('Budget semaine dépassé');

    const tdee = parseFloat(settings.tdee || '0');
    if (tdee && stats.calories_today > tdee) alerts.push('Calories du jour au-dessus du TDEE');

    if (stats.whoop_recovery !== null && stats.whoop_recovery < 33) alerts.push('Recovery Whoop faible');

    res.json({ stats, alerts, settings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Settings ----------
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.getAllSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    await db.setSetting(key, String(value ?? ''));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Finances ----------
app.get('/api/expenses', async (req, res) => {
  try {
    const start = req.query.start || addDays(isoDate(), -30);
    const end = req.query.end || isoDate();
    const rows = await db.getExpenses(start, end);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { amount, category, note, tags, date } = req.body;
    if (!amount || !category || !date) return res.status(400).json({ error: 'amount, category, date required' });
    const r = await db.createExpense({ amount, category, note, tags, date });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    await db.deleteExpense(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/financial-goals', async (req, res) => {
  try {
    res.json(await db.getFinancialGoals());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/financial-goals', async (req, res) => {
  try {
    const { amount, label } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount required' });
    res.json(await db.createFinancialGoal(amount, label));
  } catch (e) {
    // Erreur contrainte UNIQUE (doublon)
    if (e.code === '23505') {
      return res.status(400).json({ error: `Un objectif de ${amount}€ existe déjà` });
    }
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/financial-goals/:id/achieve', async (req, res) => {
  try {
    await db.achieveGoal(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/financial-goals/:id', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM financial_goals WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: cleanup duplicates (garde 1 seul objectif par montant)
app.post('/api/admin/cleanup-goals', async (req, res) => {
  try {
    const result = await db.pool.query(`
      DELETE FROM financial_goals
      WHERE id NOT IN (
        SELECT MAX(id)
        FROM financial_goals
        GROUP BY amount
      )
    `);
    res.json({ ok: true, deleted: result.rowCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Corps / Training ----------
app.get('/api/workouts', async (req, res) => {
  try {
    const start = req.query.start || addDays(isoDate(), -30);
    const end = req.query.end || isoDate();
    res.json(await db.getWorkouts(start, end));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/workouts/:id', async (req, res) => {
  try {
    res.json(await db.getWorkout(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/workouts', async (req, res) => {
  try {
    const { date, exercises } = req.body;
    if (!date) return res.status(400).json({ error: 'date required' });
    // exercises: [{name, sets, reps, weight, rpe, notes}]
    if (exercises && !Array.isArray(exercises)) return res.status(400).json({ error: 'exercises must be array' });
    const r = await db.createWorkout(req.body);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/cardio', async (req, res) => {
  try {
    const start = req.query.start || addDays(isoDate(), -30);
    const end = req.query.end || isoDate();
    res.json(await db.getCardio(start, end));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cardio', async (req, res) => {
  try {
    const { date, type, duration_min } = req.body;
    if (!date || !type || !duration_min) return res.status(400).json({ error: 'date, type, duration_min required' });
    res.json(await db.createCardio(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/prs', async (req, res) => {
  try {
    res.json(await db.getPRs());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/prs', async (req, res) => {
  try {
    const { exercise_name, weight, reps, date } = req.body;
    if (!exercise_name || !weight || !reps || !date) return res.status(400).json({ error: 'exercise_name, weight, reps, date required' });
    res.json(await db.createPR(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Nutrition ----------
app.get('/api/nutrition', async (req, res) => {
  try {
    const start = req.query.start || addDays(isoDate(), -14);
    const end = req.query.end || isoDate();
    res.json(await db.getNutrition(start, end));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/nutrition', async (req, res) => {
  try {
    const { date, calories } = req.body;
    if (!date || !calories) return res.status(400).json({ error: 'date, calories required' });
    res.json(await db.createNutrition(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/nutrition/:id', async (req, res) => {
  try {
    await db.deleteNutrition(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Weight ----------
app.get('/api/weight', async (req, res) => {
  try {
    const start = req.query.start || addDays(isoDate(), -90);
    const end = req.query.end || isoDate();
    res.json(await db.getWeight(start, end));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/weight', async (req, res) => {
  try {
    const { date, weight } = req.body;
    if (!date || !weight) return res.status(400).json({ error: 'date, weight required' });
    res.json(await db.createWeight(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Habits ----------
app.get('/api/habits', async (req, res) => {
  try {
    res.json(await db.getHabits());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/habits', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    res.json(await db.createHabit(name, description));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/habits/logs', async (req, res) => {
  try {
    const date = req.query.date || isoDate();
    res.json(await db.getHabitLogs(date));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/habits/logs', async (req, res) => {
  try {
    const { habit_id, date, completed } = req.body;
    if (!habit_id || !date) return res.status(400).json({ error: 'habit_id, date required' });
    await db.logHabit(habit_id, date, !!completed);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- WHOOP OAuth + Sync ----------
// NOTE: Whoop API endpoints may change. This implementation is structured + production-safe.
// Env required: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v1';

app.get('/api/whoop/status', async (req, res) => {
  try {
    const auth = await db.getWhoopAuth();
    res.json({ connected: !!auth, expires_at: auth?.expires_at || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/whoop/connect', async (req, res) => {
  try {
    requireEnv(['WHOOP_CLIENT_ID', 'WHOOP_REDIRECT_URI']);

    const state = crypto.randomBytes(16).toString('hex');
    // store in settings (simple single-user app)
    await db.setSetting('whoop_oauth_state', state);

    const url = new URL(WHOOP_AUTH_URL);
    url.searchParams.set('client_id', process.env.WHOOP_CLIENT_ID);
    url.searchParams.set('redirect_uri', process.env.WHOOP_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'read:profile read:recovery read:cycles read:sleep read:workout read:body_measurement offline');
    url.searchParams.set('state', state);

    res.json({ url: url.toString() });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.get('/api/whoop/callback', async (req, res) => {
  try {
    requireEnv(['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET', 'WHOOP_REDIRECT_URI']);

    const { code, state } = req.query;
    if (!code) return res.status(400).send('Missing code');

    const expectedState = await db.getSetting('whoop_oauth_state');
    if (expectedState && state !== expectedState) return res.status(400).send('Invalid state');

    const tokenRes = await axios.post(
      WHOOP_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        client_id: process.env.WHOOP_CLIENT_ID,
        client_secret: process.env.WHOOP_CLIENT_SECRET,
        redirect_uri: process.env.WHOOP_REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const expiresAt = new Date(Date.now() + (Number(expires_in) || 3600) * 1000);
    await db.saveWhoopAuth(access_token, refresh_token, expiresAt.toISOString());

    // Redirect back to app
    res.redirect('/?whoop=connected');
  } catch (e) {
    res.status(500).send(`Whoop callback error: ${e.message}`);
  }
});

async function whoopRefreshIfNeeded() {
  const auth = await db.getWhoopAuth();
  if (!auth) return null;

  const exp = new Date(auth.expires_at).getTime();
  if (Date.now() < exp - 60_000) return auth; // still valid

  requireEnv(['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET', 'WHOOP_REDIRECT_URI']);

  const tokenRes = await axios.post(
    WHOOP_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.refresh_token,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET,
      redirect_uri: process.env.WHOOP_REDIRECT_URI
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const { access_token, refresh_token, expires_in } = tokenRes.data;
  const expiresAt = new Date(Date.now() + (Number(expires_in) || 3600) * 1000);
  await db.saveWhoopAuth(access_token, refresh_token, expiresAt.toISOString());

  return await db.getWhoopAuth();
}

// Public cron endpoint (protected by secret)
app.post('/api/cron/whoop-sync', async (req, res) => {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  const CRON_SECRET = process.env.CRON_SECRET || SESSION_SECRET;
  
  if (secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Invalid cron secret' });
  }

  try {
    const days = Number(req.body.days || 2);
    const auth = await whoopRefreshIfNeeded();
    if (!auth) return res.status(400).json({ error: 'Whoop not connected' });

    const headers = { Authorization: `Bearer ${auth.access_token}` };
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.min(Math.max(days, 1), 365));

    const end = endDate.toISOString();
    const start = startDate.toISOString();

    const cyclesUrl = `${WHOOP_API_BASE}/cycle?start=${start}&end=${end}&limit=25`;
    const sleepUrl = `${WHOOP_API_BASE}/sleep?start=${start}&end=${end}&limit=25`;

    const [cyclesRes, sleepRes] = await Promise.all([
      axios.get(cyclesUrl, { headers }).catch((e) => ({ error: e })),
      axios.get(sleepUrl, { headers }).catch((e) => ({ error: e }))
    ]);

    if (cyclesRes.error && sleepRes.error) {
      return res.status(502).json({ error: 'Whoop API error' });
    }

    const cycles = (cyclesRes.data?.records || cyclesRes.data?.data || cyclesRes.data || []).map((r) => r);
    const sleeps = (sleepRes.data?.records || sleepRes.data?.data || sleepRes.data || []).map((r) => r);

    const sleepByDate = new Map();
    for (const s of sleeps) {
      const d = (s?.end || s?.timestamp || s?.date || s?.sleep_start)?.slice?.(0, 10) || s?.date;
      if (d) sleepByDate.set(d, s);
    }

    let upserted = 0;
    for (const c of cycles) {
      const dateKey = (c?.end || c?.timestamp || c?.date)?.slice?.(0, 10);
      if (!dateKey) continue;

      const sleep = sleepByDate.get(dateKey);
      await db.saveWhoopData({
        date: dateKey,
        sleep_score: sleep?.score?.stage_summary?.score || sleep?.score || null,
        recovery_score: c?.score?.recovery_score || c?.recovery_score || null,
        strain: c?.score?.strain || c?.strain || null,
        hrv: c?.score?.hrv_rmssd_milli || c?.hrv || null,
        resting_hr: c?.score?.resting_heart_rate || c?.resting_hr || null,
        sleep_hours: sleep?.score?.sleep_hours || sleep?.sleep_hours ? (sleep.score?.sleep_hours || sleep.sleep_hours) / 60 : null,
        sleep_debt: sleep?.score?.sleep_debt || sleep?.sleep_debt || null,
        calories: c?.score?.kilojoule ? Math.round(c.score.kilojoule * 0.239006) : c?.calories || null
      });
      upserted++;
    }

    res.json({ ok: true, upserted, range: { start, end } });
  } catch (error) {
    console.error('Cron sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/whoop/sync', async (req, res) => {
  try {
    const days = Number(req.body.days || 30);
    const auth = await whoopRefreshIfNeeded();
    if (!auth) return res.status(400).json({ error: 'Whoop not connected' });

    // Fetch cycles (recovery/strain) and sleep. Endpoints may vary; keep robust.
    const headers = { Authorization: `Bearer ${auth.access_token}` };

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.min(Math.max(days, 1), 365));

    const end = endDate.toISOString();
    const start = startDate.toISOString();

    // Try a few common endpoints; if Whoop changes, return helpful error.
    const cyclesUrl = `${WHOOP_API_BASE}/cycle?start=${start}&end=${end}&limit=25`;
    const sleepUrl = `${WHOOP_API_BASE}/sleep?start=${start}&end=${end}&limit=25`;

    const [cyclesRes, sleepRes] = await Promise.all([
      axios.get(cyclesUrl, { headers }).catch((e) => ({ error: e })),
      axios.get(sleepUrl, { headers }).catch((e) => ({ error: e }))
    ]);

    if (cyclesRes.error && sleepRes.error) {
      return res.status(502).json({
        error: 'Whoop API error',
        hint: 'Check Whoop Developer API endpoints/scopes. This build expects /developer/v1/cycle and /developer/v1/sleep.',
        cycles: cyclesRes.error?.response?.data || cyclesRes.error.message,
        sleep: sleepRes.error?.response?.data || sleepRes.error.message
      });
    }

    // Normalize (best-effort)
    const cycles = (cyclesRes.data?.records || cyclesRes.data?.data || cyclesRes.data || []).map((r) => r);
    const sleeps = (sleepRes.data?.records || sleepRes.data?.data || sleepRes.data || []).map((r) => r);

    // Index sleeps by date
    const sleepByDate = new Map();
    for (const s of sleeps) {
      const d = (s?.end || s?.timestamp || s?.date || s?.sleep_start)?.slice?.(0, 10) || s?.date;
      if (d) sleepByDate.set(d, s);
    }

    let upserted = 0;
    for (const c of cycles) {
      const d = (c?.end || c?.timestamp || c?.date || c?.cycle_end)?.slice?.(0, 10) || c?.date;
      if (!d) continue;

      const s = sleepByDate.get(d);

      const payload = {
        date: d,
        sleep_score: s?.score?.sleep || s?.sleep_score || null,
        recovery_score: c?.score?.recovery || c?.recovery_score || null,
        strain: c?.score?.strain || c?.strain || null,
        hrv: c?.score?.hrv_rmssd_milli || c?.hrv || null,
        resting_hr: c?.score?.resting_heart_rate || c?.resting_hr || null,
        sleep_hours: s?.score?.duration ? (Number(s.score.duration) / 3600) : (s?.sleep_hours || null),
        sleep_debt: s?.score?.sleep_debt || s?.sleep_debt || null,
        calories: c?.score?.kilojoule ? Math.round(Number(c.score.kilojoule) / 4.184) : (c?.calories || null)
      };

      await db.saveWhoopData(payload);
      upserted++;
    }

    res.json({ ok: true, range: { start, end }, upserted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/whoop/data', async (req, res) => {
  try {
    const start = req.query.start || addDays(isoDate(), -30);
    const end = req.query.end || isoDate();
    res.json(await db.getWhoopData(start, end));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Frontend ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nLifeCRM running: http://localhost:${PORT}`);
});

module.exports = app;
