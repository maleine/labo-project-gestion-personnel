// ==================== middleware/accessControl.js ====================

/**
 * Définition des permissions par type de personnel
 */
const PERMISSIONS = {
  'Biologiste': {
    modules: ['dashboard', 'personnel', 'organigramme', 'equipes', 'rh', 'absences', 'exports', 'rapports'],
    defaultRoute: '/dashboard',
    canManage: true
  },
  'Cadre': {
    modules: ['rh', 'absences', 'personnel', 'exports', 'rapports'],
    defaultRoute: '/rh/dashboard',
    canManage: true
  },
  'Secrétaire': {
    modules: ['rh', 'personnel', 'absences'],
    defaultRoute: '/rh/dashboard',
    canManage: false
  },
  'Technicien': {
    modules: ['pointage', 'absences'],
    defaultRoute: '/pointage',
    canManage: false
  },
  'Préleveur': {
    modules: ['pointage', 'absences'],
    defaultRoute: '/pointage',
    canManage: false
  }
};

/**
 * Middleware pour vérifier l'accès à un module
 */
function checkModuleAccess(moduleName) {
  return (req, res, next) => {
    const typePersonnel = req.session.type_personnel;
    
    if (!typePersonnel) {
      return res.redirect('/auth/login');
    }

    const permissions = PERMISSIONS[typePersonnel];
    
    if (!permissions) {
      return res.status(403).render('error', {
        title: 'Accès refusé',
        message: 'Type de personnel non reconnu',
        error: { status: 403 },
        currentPage: 'error'
      });
    }

    if (!permissions.modules.includes(moduleName)) {
      return res.status(403).render('error', {
        title: 'Accès refusé',
        message: `Vous n'avez pas accès au module "${moduleName}"`,
        error: { status: 403 },
        currentPage: 'error'
      });
    }

    next();
  };
}

/**
 * Middleware pour vérifier les droits de gestion
 */
function requireManagePermission(req, res, next) {
  const typePersonnel = req.session.type_personnel;
  const permissions = PERMISSIONS[typePersonnel];

  if (!permissions || !permissions.canManage) {
    return res.status(403).render('error', {
      title: 'Accès refusé',
      message: 'Vous n\'avez pas les droits de gestion nécessaires',
      error: { status: 403 },
      currentPage: 'error'
    });
  }

  next();
}

/**
 * Obtenir la route par défaut selon le type de personnel
 */
function getDefaultRoute(typePersonnel) {
  const permissions = PERMISSIONS[typePersonnel];
  return permissions ? permissions.defaultRoute : '/dashboard';
}

/**
 * Vérifier si un utilisateur a accès à un module
 */
function hasModuleAccess(typePersonnel, moduleName) {
  const permissions = PERMISSIONS[typePersonnel];
  return permissions && permissions.modules.includes(moduleName);
}

/**
 * Middleware pour injecter les permissions dans res.locals
 */
function injectPermissions(req, res, next) {
  const typePersonnel = req.session.type_personnel;
  const permissions = PERMISSIONS[typePersonnel] || { modules: [], canManage: false };
  
  res.locals.userPermissions = permissions;
  res.locals.hasModuleAccess = (module) => permissions.modules.includes(module);
  res.locals.canManage = permissions.canManage;
  res.locals.type_personnel = typePersonnel;
  
  next();
}

module.exports = {
  PERMISSIONS,
  checkModuleAccess,
  requireManagePermission,
  getDefaultRoute,
  hasModuleAccess,
  injectPermissions
};