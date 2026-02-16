require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');
const axios = require('axios');

const LOCAL_DB = 'postgresql://gaspardbonnot@localhost:5432/lifecrm';
const VERCEL_API = 'https://life-crm.vercel.app/api';
const PASSWORD = '0850151917';

async function migrate() {
  console.log('🔄 Starting migration...\n');

  // Connect to local DB
  const pool = new Pool({ connectionString: LOCAL_DB, ssl: false });
  
  try {
    // Login to Vercel
    console.log('🔐 Logging in...');
    const loginRes = await axios.post(`${VERCEL_API}/auth/login`, { password: PASSWORD });
    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
    
    const headers = { 
      'Content-Type': 'application/json',
      'Cookie': cookie
    };

    // 1. Settings
    console.log('📋 Migrating settings...');
    const settings = await pool.query('SELECT key, value FROM settings');
    for (const row of settings.rows) {
      await axios.post(`${VERCEL_API}/settings`, 
        { key: row.key, value: row.value }, 
        { headers }
      );
    }
    console.log(`  ✅ ${settings.rows.length} settings`);

    // 2. Financial Goals (skip, already exist in Vercel by default)
    console.log('💰 Skipping financial goals (already in Vercel)...');
    const goals = await pool.query('SELECT * FROM financial_goals');
    console.log(`  ⏭️  ${goals.rows.length} goals (skipped)`);

    // 3-8. Skip empty tables
    const counts = await Promise.all([
      pool.query('SELECT COUNT(*) FROM expenses'),
      pool.query('SELECT COUNT(*) FROM nutrition'),
      pool.query('SELECT COUNT(*) FROM weight'),
      pool.query('SELECT COUNT(*) FROM workouts')
    ]);
    console.log('ℹ️  Skipping empty tables:');
    console.log(`  ⏭️  ${counts[0].rows[0].count} expenses`);
    console.log(`  ⏭️  ${counts[1].rows[0].count} nutrition`);
    console.log(`  ⏭️  ${counts[2].rows[0].count} weight`);
    console.log(`  ⏭️  ${counts[3].rows[0].count} workouts`);

    // 10. Whoop Data
    console.log('📊 Migrating Whoop data...');
    const whoopData = await pool.query('SELECT * FROM whoop_data ORDER BY date DESC');
    for (const wd of whoopData.rows) {
      await axios.post(`${VERCEL_API}/whoop/save-data`, {
        date: wd.date.toISOString().split('T')[0],
        sleep_score: wd.sleep_score,
        recovery_score: wd.recovery_score,
        strain: wd.strain ? parseFloat(wd.strain) : null,
        hrv: wd.hrv,
        resting_hr: wd.resting_hr,
        sleep_hours: wd.sleep_hours ? parseFloat(wd.sleep_hours) : null,
        sleep_debt: wd.sleep_debt,
        calories: wd.calories
      }, { headers });
    }
    console.log(`  ✅ ${whoopData.rows.length} Whoop entries`);

    console.log('\n✨ Migration complete!\n');
    console.log('🌐 Your data is now available at: https://life-crm.vercel.app');
    console.log('🔑 Login with password: 0850151917');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
