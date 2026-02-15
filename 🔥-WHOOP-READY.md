# 🔥 WHOOP AUTO-SYNC READY

✅ **Tout est prêt**. Il ne te reste plus qu'à:

---

## 🎯 Ce dont j'ai besoin

### 1. Credentials Whoop API

Va sur: **https://developer.whoop.com/dashboard**

Crée une App et donne-moi:

```
WHOOP_CLIENT_ID=?
WHOOP_CLIENT_SECRET=?
```

**Redirect URI à mettre dans la config Whoop**:
- Local: `http://localhost:3000/api/whoop/callback`
- Prod: `https://lifecrm.vercel.app/api/whoop/callback` (change l'URL selon ton déploiement)

**Scopes à cocher**: TOUS (surtout `offline` pour le refresh auto)

---

## 📁 Fichiers Créés

| Fichier | Description |
|---------|-------------|
| `WHOOP-SETUP.md` | Guide complet étape par étape |
| `.env.example` | Template des variables d'environnement |
| `cron-whoop-sync.js` | Script de synchro automatique quotidienne |

---

## ⚡ Quick Start

1. **Crée ton App Whoop** (lien au-dessus)
2. **Copie `.env.example` → `.env`** et remplis les credentials
3. **Connecte-toi**: Va sur `http://localhost:3000/api/whoop/connect`
4. **Setup le cron** (voir WHOOP-SETUP.md)

→ **C'est tout!** Les données se synchronisent automatiquement chaque jour.

---

## 🎁 Ce Que Tu Auras

Chaque nuit, automatiquement dans LifeCRM:

- 😴 Sleep Score
- 💪 Recovery Score  
- 🔥 Strain
- ❤️ HRV + Resting HR
- ⏰ Sleep Hours + Debt
- 🔥 Calories

**Zéro action requise après la première connexion.**

---

Dis-moi quand tu as les credentials et je setup le reste! 🔒
