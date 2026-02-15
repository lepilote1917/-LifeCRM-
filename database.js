const { Pool } = require('pg');

// Connection pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize schema
async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Settings (user config)
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Financial Goals (paliers)
      CREATE TABLE IF NOT EXISTS financial_goals (
        id SERIAL PRIMARY KEY,
        amount INTEGER NOT NULL,
        label TEXT,
        achieved BOOLEAN DEFAULT FALSE,
        achieved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Ajouter contrainte UNIQUE sur amount (empêche les doublons)
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'financial_goals_amount_unique'
        ) THEN
          ALTER TABLE financial_goals ADD CONSTRAINT financial_goals_amount_unique UNIQUE (amount);
        END IF;
      END $$;

      -- Expenses
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        amount DECIMAL(10,2) NOT NULL,
        category TEXT NOT NULL,
        note TEXT,
        tags TEXT[],
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Workouts (séances muscu)
      CREATE TABLE IF NOT EXISTS workouts (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        duration_min INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Exercises (exercices dans séances)
      CREATE TABLE IF NOT EXISTS exercises (
        id SERIAL PRIMARY KEY,
        workout_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sets INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        weight DECIMAL(6,2),
        rpe INTEGER,
        notes TEXT,
        FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
      );

      -- Cardio
      CREATE TABLE IF NOT EXISTS cardio (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        type TEXT NOT NULL,
        duration_min INTEGER NOT NULL,
        intensity TEXT,
        calories INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- PRs (Personal Records)
      CREATE TABLE IF NOT EXISTS prs (
        id SERIAL PRIMARY KEY,
        exercise_name TEXT NOT NULL,
        weight DECIMAL(6,2) NOT NULL,
        reps INTEGER NOT NULL,
        date DATE NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Nutrition
      CREATE TABLE IF NOT EXISTS nutrition (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        meal_name TEXT,
        calories INTEGER NOT NULL,
        protein DECIMAL(6,2),
        carbs DECIMAL(6,2),
        fat DECIMAL(6,2),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Weight
      CREATE TABLE IF NOT EXISTS weight (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        weight DECIMAL(5,2) NOT NULL,
        waist DECIMAL(5,2),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Whoop Auth (OAuth tokens)
      CREATE TABLE IF NOT EXISTS whoop_auth (
        id SERIAL PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Whoop Data (cached metrics)
      CREATE TABLE IF NOT EXISTS whoop_data (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        sleep_score INTEGER,
        recovery_score INTEGER,
        strain DECIMAL(4,2),
        hrv INTEGER,
        resting_hr INTEGER,
        sleep_hours DECIMAL(4,2),
        sleep_debt INTEGER,
        calories INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Habits
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Habit Logs
      CREATE TABLE IF NOT EXISTS habit_logs (
        id SERIAL PRIMARY KEY,
        habit_id INTEGER NOT NULL,
        date DATE NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        notes TEXT,
        FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
        UNIQUE(habit_id, date)
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC);
      CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date DESC);
      CREATE INDEX IF NOT EXISTS idx_nutrition_date ON nutrition(date DESC);
      CREATE INDEX IF NOT EXISTS idx_weight_date ON weight(date DESC);
      CREATE INDEX IF NOT EXISTS idx_whoop_date ON whoop_data(date DESC);
      CREATE INDEX IF NOT EXISTS idx_cardio_date ON cardio(date DESC);

      -- Default settings
      INSERT INTO settings (key, value) VALUES 
        ('weekly_budget', '500'),
        ('tdee', '2500'),
        ('protein_target', '180'),
        ('carbs_target', '250'),
        ('fat_target', '70'),
        ('weight_goal', '80'),
        ('unit_system', 'metric')
      ON CONFLICT (key) DO NOTHING;

      -- Default financial goals
      INSERT INTO financial_goals (amount, label) VALUES 
        (1000, 'Premier palier'),
        (2000, 'Palier intermédiaire'),
        (5000, 'Objectif 5K'),
        (10000, 'Objectif 10K')
      ON CONFLICT DO NOTHING;
    `);
    console.log('✅ Schema initialized');
  } catch (err) {
    console.error('❌ Schema init error:', err.message);
  } finally {
    client.release();
  }
}

// ===== SETTINGS =====
async function getSetting(key) {
  const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return result.rows[0]?.value || null;
}

async function setSetting(key, value) {
  await pool.query(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
  `, [key, value]);
}

async function getAllSettings() {
  const result = await pool.query('SELECT key, value FROM settings');
  return result.rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

// ===== FINANCES =====
async function getExpenses(startDate, endDate) {
  const result = await pool.query(
    'SELECT * FROM expenses WHERE date >= $1 AND date <= $2 ORDER BY date DESC',
    [startDate, endDate]
  );
  return result.rows;
}

async function createExpense(data) {
  const { amount, category, note, tags, date } = data;
  const result = await pool.query(`
    INSERT INTO expenses (amount, category, note, tags, date)
    VALUES ($1, $2, $3, $4, $5) RETURNING id
  `, [amount, category, note || null, tags || null, date]);
  return result.rows[0];
}

async function deleteExpense(id) {
  await pool.query('DELETE FROM expenses WHERE id = $1', [id]);
}

async function getFinancialGoals() {
  const result = await pool.query('SELECT * FROM financial_goals ORDER BY amount ASC');
  return result.rows;
}

async function createFinancialGoal(amount, label) {
  const result = await pool.query(`
    INSERT INTO financial_goals (amount, label) VALUES ($1, $2) RETURNING id
  `, [amount, label]);
  return result.rows[0];
}

async function achieveGoal(id) {
  await pool.query(`
    UPDATE financial_goals SET achieved = TRUE, achieved_at = CURRENT_TIMESTAMP WHERE id = $1
  `, [id]);
}

// ===== TRAINING =====
async function getWorkouts(startDate, endDate) {
  const result = await pool.query(
    'SELECT * FROM workouts WHERE date >= $1 AND date <= $2 ORDER BY date DESC',
    [startDate, endDate]
  );
  return result.rows;
}

async function getWorkout(id) {
  const workout = await pool.query('SELECT * FROM workouts WHERE id = $1', [id]);
  const exercises = await pool.query('SELECT * FROM exercises WHERE workout_id = $1 ORDER BY id', [id]);
  return { ...workout.rows[0], exercises: exercises.rows };
}

async function createWorkout(data) {
  const { date, duration_min, notes, exercises } = data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const workout = await client.query(`
      INSERT INTO workouts (date, duration_min, notes) VALUES ($1, $2, $3) RETURNING id
    `, [date, duration_min || null, notes || null]);
    const workoutId = workout.rows[0].id;

    if (exercises && exercises.length > 0) {
      for (const ex of exercises) {
        await client.query(`
          INSERT INTO exercises (workout_id, name, sets, reps, weight, rpe, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [workoutId, ex.name, ex.sets, ex.reps, ex.weight || null, ex.rpe || null, ex.notes || null]);
      }
    }
    await client.query('COMMIT');
    return { id: workoutId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getCardio(startDate, endDate) {
  const result = await pool.query(
    'SELECT * FROM cardio WHERE date >= $1 AND date <= $2 ORDER BY date DESC',
    [startDate, endDate]
  );
  return result.rows;
}

async function createCardio(data) {
  const { date, type, duration_min, intensity, calories, notes } = data;
  const result = await pool.query(`
    INSERT INTO cardio (date, type, duration_min, intensity, calories, notes)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `, [date, type, duration_min, intensity || null, calories || null, notes || null]);
  return result.rows[0];
}

async function getPRs() {
  const result = await pool.query('SELECT * FROM prs ORDER BY date DESC LIMIT 20');
  return result.rows;
}

async function createPR(data) {
  const { exercise_name, weight, reps, date, notes } = data;
  const result = await pool.query(`
    INSERT INTO prs (exercise_name, weight, reps, date, notes)
    VALUES ($1, $2, $3, $4, $5) RETURNING id
  `, [exercise_name, weight, reps, date, notes || null]);
  return result.rows[0];
}

// ===== NUTRITION =====
async function getNutrition(startDate, endDate) {
  const result = await pool.query(
    'SELECT * FROM nutrition WHERE date >= $1 AND date <= $2 ORDER BY date DESC, created_at DESC',
    [startDate, endDate]
  );
  return result.rows;
}

async function createNutrition(data) {
  const { date, meal_name, calories, protein, carbs, fat, notes } = data;
  const result = await pool.query(`
    INSERT INTO nutrition (date, meal_name, calories, protein, carbs, fat, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, [date, meal_name || null, calories, protein || null, carbs || null, fat || null, notes || null]);
  return result.rows[0];
}

async function deleteNutrition(id) {
  await pool.query('DELETE FROM nutrition WHERE id = $1', [id]);
}

// ===== WEIGHT =====
async function getWeight(startDate, endDate) {
  const result = await pool.query(
    'SELECT * FROM weight WHERE date >= $1 AND date <= $2 ORDER BY date DESC',
    [startDate, endDate]
  );
  return result.rows;
}

async function createWeight(data) {
  const { date, weight, waist, notes } = data;
  const result = await pool.query(`
    INSERT INTO weight (date, weight, waist, notes)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (date) DO UPDATE SET weight = $2, waist = $3, notes = $4
    RETURNING id
  `, [date, weight, waist || null, notes || null]);
  return result.rows[0];
}

// ===== WHOOP =====
async function getWhoopAuth() {
  const result = await pool.query('SELECT * FROM whoop_auth ORDER BY created_at DESC LIMIT 1');
  return result.rows[0] || null;
}

async function saveWhoopAuth(accessToken, refreshToken, expiresAt) {
  await pool.query('DELETE FROM whoop_auth');
  await pool.query(`
    INSERT INTO whoop_auth (access_token, refresh_token, expires_at)
    VALUES ($1, $2, $3)
  `, [accessToken, refreshToken, expiresAt]);
}

async function getWhoopData(startDate, endDate) {
  const result = await pool.query(
    'SELECT * FROM whoop_data WHERE date >= $1 AND date <= $2 ORDER BY date DESC',
    [startDate, endDate]
  );
  return result.rows;
}

async function saveWhoopData(data) {
  const { date, sleep_score, recovery_score, strain, hrv, resting_hr, sleep_hours, sleep_debt, calories } = data;
  await pool.query(`
    INSERT INTO whoop_data (date, sleep_score, recovery_score, strain, hrv, resting_hr, sleep_hours, sleep_debt, calories)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (date) DO UPDATE SET 
      sleep_score = $2, recovery_score = $3, strain = $4, hrv = $5, resting_hr = $6, 
      sleep_hours = $7, sleep_debt = $8, calories = $9
  `, [date, sleep_score, recovery_score, strain, hrv, resting_hr, sleep_hours, sleep_debt, calories]);
}

// ===== HABITS =====
async function getHabits() {
  const result = await pool.query('SELECT * FROM habits WHERE active = TRUE ORDER BY created_at');
  return result.rows;
}

async function createHabit(name, description) {
  const result = await pool.query(`
    INSERT INTO habits (name, description) VALUES ($1, $2) RETURNING id
  `, [name, description || null]);
  return result.rows[0];
}

async function getHabitLogs(date) {
  const result = await pool.query(`
    SELECT hl.*, h.name, h.description 
    FROM habit_logs hl
    JOIN habits h ON h.id = hl.habit_id
    WHERE hl.date = $1
    ORDER BY h.created_at
  `, [date]);
  return result.rows;
}

async function logHabit(habitId, date, completed) {
  await pool.query(`
    INSERT INTO habit_logs (habit_id, date, completed)
    VALUES ($1, $2, $3)
    ON CONFLICT (habit_id, date) DO UPDATE SET completed = $3
  `, [habitId, date, completed]);
}

// ===== STATS =====
async function getDashboardStats() {
  const today = new Date().toISOString().split('T')[0];
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [
    expensesWeek,
    lastWeight,
    nutritionToday,
    whoopToday,
    workoutsWeek
  ] = await Promise.all([
    pool.query('SELECT SUM(amount) as total FROM expenses WHERE date >= $1', [weekStart]),
    pool.query('SELECT weight FROM weight ORDER BY date DESC LIMIT 1'),
    pool.query('SELECT SUM(calories) as total FROM nutrition WHERE date = $1', [today]),
    pool.query('SELECT * FROM whoop_data ORDER BY date DESC LIMIT 1'),
    pool.query('SELECT COUNT(*) as count FROM workouts WHERE date >= $1', [weekStart])
  ]);

  return {
    expenses_week: parseFloat(expensesWeek.rows[0]?.total || 0),
    weight_current: parseFloat(lastWeight.rows[0]?.weight || 0),
    calories_today: parseInt(nutritionToday.rows[0]?.total || 0),
    whoop_recovery: whoopToday.rows[0]?.recovery_score || null,
    whoop_strain: whoopToday.rows[0]?.strain || null,
    workouts_week: parseInt(workoutsWeek.rows[0]?.count || 0)
  };
}

module.exports = {
  pool,
  initSchema,
  getSetting,
  setSetting,
  getAllSettings,
  getExpenses,
  createExpense,
  deleteExpense,
  getFinancialGoals,
  createFinancialGoal,
  achieveGoal,
  getWorkouts,
  getWorkout,
  createWorkout,
  getCardio,
  createCardio,
  getPRs,
  createPR,
  getNutrition,
  createNutrition,
  deleteNutrition,
  getWeight,
  createWeight,
  getWhoopAuth,
  saveWhoopAuth,
  getWhoopData,
  saveWhoopData,
  getHabits,
  createHabit,
  getHabitLogs,
  logHabit,
  getDashboardStats
};
