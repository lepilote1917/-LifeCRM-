# 🔄 Whoop Auto-Sync 24/7

## Configuration du sync automatique

### Option 1: cron-job.org (Recommandé - GRATUIT)

1. **Va sur** https://cron-job.org/en/ et crée un compte gratuit
2. **Crée un nouveau job:**
   - Title: `LifeCRM Whoop Sync`
   - URL: `https://life-crm.vercel.app/api/cron/whoop-sync?secret=YOUR_SECRET`
   - Schedule: **Toutes les heures** (`0 * * * *`) ou **2 fois par jour** (`0 9,21 * * *`)
   - HTTP Method: `POST`
   - Request body: `{"days": 2}` (format: JSON)
   - Headers: 
     - `Content-Type: application/json`
     - `x-cron-secret: YOUR_SECRET`

3. **Remplace `YOUR_SECRET`** par le secret ci-dessous
4. **Active le job**

### Secret (à utiliser dans l'URL ou header)

```
d8695ee7a7334ea9b28a705f35f0d484f302177b1bc4b0940d8d8b713ea7176b
```

### Option 2: EasyCron (Alternative gratuite)

1. Va sur https://www.easycron.com
2. Même configuration que ci-dessus
3. Schedule: `0 */2 * * *` (toutes les 2 heures)

### Test manuel

Pour tester le cron maintenant:

```bash
curl -X POST "https://life-crm.vercel.app/api/cron/whoop-sync?secret=d8695ee7a7334ea9b28a705f35f0d484f302177b1bc4b0940d8d8b713ea7176b" \
  -H "Content-Type: application/json" \
  -d '{"days": 7}'
```

Réponse attendue:
```json
{"ok":true,"upserted":7,"range":{"start":"...","end":"..."}}
```

### Fréquence recommandée

- **Optimal:** Toutes les 2-3 heures (pour avoir les données fraîches)
- **Économique:** 2 fois par jour (9h et 21h)
- **Maximum:** Toutes les heures (si tu veux vraiment du temps réel)

### Monitoring

Pour vérifier la dernière sync depuis le dashboard:
- **Onglet Training** → Voir la date de dernière mise à jour Whoop
- Les données sont affichées en temps réel dès qu'elles sont synchronisées

---

✅ **Configuré par Jarvis le 2026-02-16** 🔒
