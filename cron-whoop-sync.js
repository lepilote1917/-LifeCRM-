#!/usr/bin/env node

/**
 * WHOOP Auto-Sync - Cron Job
 * 
 * Synchro automatique des données Whoop chaque jour.
 * À lancer via cron: 0 9 * * * /chemin/vers/cron-whoop-sync.js
 * 
 * Synchro à 9h du matin (après que Whoop ait processé la nuit)
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE = process.env.LIFECRM_URL || 'http://localhost:3000';

async function syncWhoop() {
  try {
    console.log('🔄 [Whoop Auto-Sync] Démarrage...');
    
    // Appeler l'endpoint de synchro (synchro des 2 derniers jours pour être sûr)
    const response = await axios.post(`${API_BASE}/api/whoop/sync`, {
      days: 2
    }, {
      timeout: 30000 // 30s timeout
    });

    if (response.data.ok) {
      console.log('✅ [Whoop Auto-Sync] Synchro terminée avec succès');
      console.log(`📊 Données synchronisées: ${response.data.upserted || 0} jours`);
    } else {
      console.error('❌ [Whoop Auto-Sync] Erreur:', response.data.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ [Whoop Auto-Sync] Erreur critique:', error.message);
    
    // Si erreur 400 = pas connecté
    if (error.response?.status === 400) {
      console.error('⚠️  Whoop non connecté. Connecte-toi via le dashboard: /api/whoop/connect');
    }
    
    process.exit(1);
  }
}

// Lancer la synchro
syncWhoop().then(() => {
  console.log('✨ [Whoop Auto-Sync] Terminé');
  process.exit(0);
}).catch((err) => {
  console.error('💥 [Whoop Auto-Sync] Crash:', err);
  process.exit(1);
});
