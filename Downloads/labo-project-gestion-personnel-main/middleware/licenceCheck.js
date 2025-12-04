// ==========================================
// MIDDLEWARE VÉRIFICATION LICENCE
// ==========================================
const licenceManager = require('../utils/licenceManager');

// Middleware pour vérifier la licence
async function requireLicence(req, res, next) {
  // Exclure les routes de licence de la vérification
  if (req.path.startsWith('/licence/')) {
    return next();
  }
  
  const status = await licenceManager.checkLicence();
  
  if (!status.valid) {
    // Rediriger vers la page d'activation
    return res.redirect('/licence/activate');
  }
  
  // Ajouter les infos de licence à res.locals pour les vues
  res.locals.licenceInfo = licenceManager.getLicenceInfo();
  
  next();
}

// Middleware pour les routes publiques (ne nécessitant pas de licence)
function publicRoute(req, res, next) {
  next();
}

module.exports = { requireLicence, publicRoute };