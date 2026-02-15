# 🔥 Whoop Auto-Sync - Setup Complet

Connexion automatique 24/7 de ton Whoop à LifeCRM.

## ✅ Prérequis

1. **Compte Whoop Developer** (gratuit)
2. **LifeCRM déployé** (local ou Vercel)
3. **Base de données PostgreSQL** configurée

---

## 📋 Étape 1: Créer une App Whoop

1. Va sur **https://developer.whoop.com/dashboard**
2. Clique **"Create App"**
3. Remplis:
   - **App Name**: LifeCRM (ou ce que tu veux)
   - **Description**: Personal dashboard integration
   - **Redirect URI**: 
     - Local: `http://localhost:3000/api/whoop/callback`
     - Prod: `https://ton-domaine.vercel.app/api/whoop/callback`
   - **Scopes**: Coche **TOUS** les scopes:
     - ✅ `read:recovery`
     - ✅ `read:cycles`
     - ✅ `read:workout`
     - ✅ `read:sleep`
     - ✅ `read:profile`
     - ✅ `read:body_measurement`
     - ✅ `offline` ← **IMPORTANT** (pour le refresh automatique)

4. **Sauvegarder**
5. Note ton **Client ID** et **Client Secret**

---

## 🔐 Étape 2: Config Environnement

Copie `.env.example` → `.env`:

```bash
cp .env.example .env
```

Édite `.env` et remplis:

```env
WHOOP_CLIENT_ID=ton_client_id_ici
WHOOP_CLIENT_SECRET=ton_client_secret_ici
WHOOP_REDIRECT_URI=http://localhost:3000/api/whoop/callback
```

**⚠️ En production (Vercel):**
- Ajoute ces variables dans **Vercel Dashboard > Settings > Environment Variables**
- Change `WHOOP_REDIRECT_URI` pour ton URL Vercel
- **Relance le déploiement** après ajout des variables

---

## 🔗 Étape 3: Connexion Whoop (une seule fois!)

1. **Lance LifeCRM**:
   ```bash
   npm start
   ```

2. **Ouvre le dashboard**: http://localhost:3000

3. **Connecte Whoop**:
   - Va sur `/api/whoop/connect` dans ton navigateur
   - OU clique sur le bouton "Connect Whoop" dans le dashboard (si tu l'as ajouté)
   - Tu seras redirigé vers Whoop
   - Connecte-toi avec ton compte Whoop
   - **Autorise l'accès**
   - Tu seras redirigé vers LifeCRM avec `?whoop=connected`

4. **Vérifie la connexion**:
   ```bash
   curl http://localhost:3000/api/whoop/status
   ```
   
   Devrait retourner:
   ```json
   {
     "connected": true,
     "expires_at": "2026-02-16T...",
     "valid": true
   }
   ```

---

## ⚡ Étape 4: Synchro Automatique (Cron)

### Option A: Cron système (macOS/Linux)

1. **Rend le script exécutable**:
   ```bash
   chmod +x /Users/gaspardbonnot/Desktop/LifeCRM/cron-whoop-sync.js
   ```

2. **Édite ta crontab**:
   ```bash
   crontab -e
   ```

3. **Ajoute cette ligne** (synchro à 9h chaque jour):
   ```cron
   0 9 * * * cd /Users/gaspardbonnot/Desktop/LifeCRM && node cron-whoop-sync.js >> /tmp/whoop-sync.log 2>&1
   ```

4. **Sauvegarde** et quitte (`:wq` si vim)

5. **Vérifie**:
   ```bash
   crontab -l
   ```

### Option B: Vercel Cron (si déployé sur Vercel)

Ajoute dans `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/whoop-sync",
      "schedule": "0 9 * * *"
    }
  ]
}
```

Puis crée `server.js` route:

```javascript
app.get('/api/cron/whoop-sync', async (req, res) => {
  try {
    // Vérifier le secret Vercel pour sécurité
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const auth = await whoopRefreshIfNeeded();
    if (!auth) return res.status(400).json({ error: 'Whoop not connected' });
    
    // Synchro 2 derniers jours
    const days = 2;
    // ... (copier la logique de /api/whoop/sync)
    
    res.json({ ok: true, message: 'Synced' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

### Option C: OpenClaw Cron (ton assistant!)

Si tu utilises OpenClaw (ton Jarvis actuel):

```bash
openclaw cron add --name "Whoop Sync" --schedule "0 9 * * *" --command "curl -X POST http://localhost:3000/api/whoop/sync"
```

---

## 🧪 Test Manuel

**Tester la synchro manuellement**:

```bash
# Synchro des 7 derniers jours
curl -X POST http://localhost:3000/api/whoop/sync -H "Content-Type: application/json" -d '{"days": 7}'

# Ou via le script
node cron-whoop-sync.js
```

**Voir les données**:

```bash
curl http://localhost:3000/api/whoop/data?start=2026-02-01&end=2026-02-15
```

---

## 📊 Données Récupérées

Chaque jour, tu auras automatiquement:

| Métrique | Description |
|----------|-------------|
| **Sleep Score** | Performance sommeil (%) |
| **Recovery Score** | Score de récupération (0-100) |
| **Strain** | Effort quotidien |
| **HRV** | Variabilité cardiaque (ms) |
| **Resting HR** | Fréquence cardiaque au repos |
| **Sleep Hours** | Heures de sommeil réel |
| **Sleep Debt** | Dette de sommeil (min) |
| **Calories** | Dépense calorique |

---

## 🔄 Maintenance

### Refresh manuel du token

Si problème:

```bash
curl -X POST http://localhost:3000/api/whoop/refresh
```

Le refresh est **automatique** quand le token expire (toutes les ~1h).

### Logs

Vérifier les logs cron:

```bash
tail -f /tmp/whoop-sync.log
```

---

## 🚨 Troubleshooting

### "Whoop not connected"

→ Refais `/api/whoop/connect`

### "Invalid refresh token"

→ Reconnecte-toi via `/api/whoop/connect` (le token a peut-être été révoqué)

### Données manquantes

→ Whoop peut prendre du temps à processer la nuit. Lance la synchro plus tard:

```bash
curl -X POST http://localhost:3000/api/whoop/sync -d '{"days": 1}'
```

---

## ✨ C'est Tout!

Une fois configuré:

1. **Tu te connectes UNE SEULE FOIS** via `/api/whoop/connect`
2. **Tout se sync automatiquement** chaque jour à 9h
3. **Le token se refresh tout seul** en background
4. **Tu n'as plus rien à faire** 🎉

Les données apparaissent automatiquement dans ton dashboard LifeCRM.

---

**Note**: Si tu déploies sur Vercel, **refais la connexion** en prod (via `https://ton-domaine.vercel.app/api/whoop/connect`) car les tokens sont stockés en DB.
