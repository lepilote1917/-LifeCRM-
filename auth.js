// Simple auth middleware
const crypto = require('crypto');

// Hash du mot de passe (ne jamais stocker en clair)
const PASSWORD_HASH = crypto.createHash('sha256').update('0850151917').digest('hex');
const SESSION_SECRET = process.env.SESSION_SECRET || 'lifecrm-secret-key-change-in-prod';

// Vérifie si l'utilisateur est authentifié
function requireAuth(req, res, next) {
  // Skip auth pour les endpoints de login
  if (req.path === '/api/auth/login' || req.path === '/api/auth/check' || req.path === '/login.html') {
    return next();
  }

  // Vérifier le cookie de session
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
  
  // Rediriger vers la page de login
  res.redirect('/login.html');
}

// Vérifier le mot de passe
function checkPassword(password) {
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  return hash === PASSWORD_HASH;
}

module.exports = { requireAuth, checkPassword, SESSION_SECRET };
