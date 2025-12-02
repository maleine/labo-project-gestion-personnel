// ==================== middleware/accessControl.js (MISE À JOUR) ====================

/**
 * Définition des permissions par type de personnel
 * Structure: { module: { typePersonnel: permissions } }
 */
const modulePermissions = {
  dashboard: {
    'Directeur': ['view', 'manage'],
    'Responsable': ['view', 'manage'],
    'Biologiste': ['view', 'manage'],
    'Cadre': ['view', 'manage'],
    'Technicien': ['view'],
    'Préleveur': ['view'],
    'Secrétaire': ['view']
  },
  personnel: {
    'Directeur': ['view', 'create', 'edit', 'delete', 'manage'],
    'Responsable': ['view', 'create', 'edit', 'manage'],
    'Biologiste': ['view', 'create', 'edit', 'manage'],
    'Cadre': ['view', 'create', 'edit', 'manage'],
    'Secrétaire': ['view', 'edit']
  },
  organigramme: {
    'Directeur': ['view', 'manage'],
    'Responsable': ['view', 'manage'],
    'Biologiste': ['view', 'manage'],
    'Cadre': ['view', 'manage'],
    'Secrétaire': ['view']
  },
  equipes: {
    'Directeur': ['view', 'create', 'edit', 'delete', 'manage'],
    'Responsable': ['view', 'create', 'edit', 'manage'],
    'Biologiste': ['view', 'create', 'edit', 'manage'],
    'Cadre': ['view', 'create', 'edit', 'manage'],
    'Technicien': ['view'],
    'Préleveur': ['view']
  },
  rh: {
    'Directeur': ['view', 'create', 'edit', 'delete', 'manage'],
    'Responsable': ['view', 'create', 'edit', 'manage'],
    'Biologiste': ['view', 'create', 'edit', 'manage'],
    'Cadre': ['view', 'create', 'edit', 'manage'],
    'Secrétaire': ['view', 'edit']
  },
  absences: {
    'Directeur': ['view', 'create', 'edit', 'delete', 'manage', 'approve'],
    'Responsable': ['view', 'create', 'edit', 'manage', 'approve'],
    'Biologiste': ['view', 'create', 'edit', 'manage', 'approve'],
    'Cadre': ['view', 'create', 'edit', 'manage', 'approve'],
    'Technicien': ['view', 'create'],
    'Préleveur': ['view', 'create'],
    'Secrétaire': ['view', 'create', 'edit']
  },
  pointage: {
    'Directeur': ['view', 'manage'],
    'Responsable': ['view', 'manage'],
    'Biologiste': ['view', 'manage'],
    'Cadre': ['view', 'manage'],
    'Technicien': ['view', 'create'],
    'Préleveur': ['view', 'create']
  },
  presence: {
    'Directeur': ['view', 'manage', 'sync', 'mapping', 'anomalies'],
    'Responsable': ['view', 'manage', 'sync', 'mapping', 'anomalies'],
    'Biologiste': ['view', 'manage', 'sync', 'mapping', 'anomalies'],
    'Cadre': ['view', 'manage', 'sync', 'mapping', 'anomalies'],
    'Technicien': ['view'],
    'Préleveur': ['view'],
    'Secrétaire': ['view', 'anomalies']
  },
  exports: {
    'Directeur': ['view', 'export'],
    'Responsable': ['view', 'export'],
    'Biologiste': ['view', 'export'],
    'Cadre': ['view', 'export'],
    'Secrétaire': ['view', 'export']
  },
  rapports: {
    'Directeur': ['view', 'generate'],
    'Responsable': ['view', 'generate'],
    'Biologiste': ['view', 'generate'],
    'Cadre': ['view', 'generate'],
    'Secrétaire': ['view']
  }
};

/**
 * Vérifie si un utilisateur a accès à un module
 * @param {string} typePersonnel - Type de personnel
 * @param {string} module - Nom du module
 * @returns {boolean}
 */
function hasModuleAccess(typePersonnel, module) {
  if (!typePersonnel || !module) return false;
  return modulePermissions[module] && modulePermissions[module][typePersonnel];
}

/**
 * Vérifie si un utilisateur a une permission spécifique sur un module
 * @param {string} typePersonnel - Type de personnel
 * @param {string} module - Nom du module
 * @param {string} permission - Permission à vérifier (view, create, edit, delete, manage, etc.)
 * @returns {boolean}
 */
function hasPermission(typePersonnel, module, permission) {
  if (!hasModuleAccess(typePersonnel, module)) return false;
  const permissions = modulePermissions[module][typePersonnel];
  return permissions.includes(permission);
}

/**
 * Vérifie si un utilisateur peut gérer (manage) un module
 * @param {string} typePersonnel - Type de personnel
 * @param {string} module - Nom du module
 * @returns {boolean}
 */
function canManage(typePersonnel, module) {
  return hasPermission(typePersonnel, module, 'manage');
}

/**
 * Middleware pour injecter les permissions dans les vues
 */
function injectPermissions(req, res, next) {
  const typePersonnel = req.session.type_personnel;
  
  // Fonction helper pour vérifier l'accès à un module
  res.locals.hasModuleAccess = (module) => {
    return hasModuleAccess(typePersonnel, module);
  };
  
  // Fonction helper pour vérifier une permission spécifique
  res.locals.hasPermission = (module, permission) => {
    return hasPermission(typePersonnel, module, permission);
  };
  
  // Fonction helper pour vérifier si l'utilisateur peut gérer
  res.locals.canManage = typePersonnel && (
    (hasModuleAccess(typePersonnel, 'absences') && canManage(typePersonnel, 'absences')) ||
    (hasModuleAccess(typePersonnel, 'rh') && canManage(typePersonnel, 'rh')) ||
    (hasModuleAccess(typePersonnel, 'presence') && canManage(typePersonnel, 'presence'))
  );
  
  next();
}

/**
 * Middleware pour vérifier l'accès à un module spécifique
 * @param {string} module - Nom du module
 */
function checkModuleAccess(module) {
  return (req, res, next) => {
    const typePersonnel = req.session.type_personnel;
    
    if (!req.session.userId) {
      return res.redirect('/auth/login');
    }
    
    if (!hasModuleAccess(typePersonnel, module)) {
      // Redirection intelligente vers une page accessible
      const defaultRoute = getDefaultRoute(typePersonnel);
      
      return res.status(403).render('error', {
        title: 'Accès refusé',
        message: `Vous n'avez pas accès au module "${module}". Type de personnel: ${typePersonnel || 'non défini'}`,
        error: { status: 403 },
        currentPage: 'error',
        redirectUrl: defaultRoute,
        redirectLabel: 'Retour à l\'accueil'
      });
    }
    
    next();
  };
}

/**
 * Obtient la route par défaut selon le type de personnel
 * REDIRECTION INTELLIGENTE: Chaque type d'utilisateur est dirigé vers la page la plus pertinente
 * @param {string} typePersonnel - Type de personnel
 * @returns {string} Route par défaut
 */
function getDefaultRoute(typePersonnel) {
  const routes = {
    // Cadres et direction: Dashboard complet
    'Directeur': '/rh/dashboard',
    'Responsable': '/rh/dashboard',
    'Biologiste': '/rh/dashboard',
    'Cadre': '/rh/dashboard',
    
    // Techniciens et Préleveurs: Leur pointage personnel ou présence
    'Technicien': '/presence/dashboard',
    'Préleveur': '/presence/dashboard',
    
    // Secrétaire: Gestion administrative (personnel ou absences)
    'Secrétaire': '/personnel'
  };
  
  // Si le type n'est pas défini, rediriger vers la première page accessible
  if (!routes[typePersonnel]) {
    return getFirstAccessibleRoute(typePersonnel);
  }
  
  return routes[typePersonnel];
}

/**
 * Obtient la première route accessible pour un type de personnel
 * Fallback si le type n'est pas dans la liste prédéfinie
 * @param {string} typePersonnel - Type de personnel
 * @returns {string} Première route accessible
 */
function getFirstAccessibleRoute(typePersonnel) {
  // Ordre de priorité des routes
  const priorityRoutes = [
    'dashboard',
    'presence',
    'pointage',
    'personnel',
    'absences',
    'equipes',
    'organigramme',
    'rh',
    'exports',
    'rapports'
  ];
  
  for (const route of priorityRoutes) {
    if (hasModuleAccess(typePersonnel, route)) {
      return `/${route}`;
    }
  }
  
  // Si aucune route n'est accessible (ne devrait jamais arriver)
  return '/auth/login';
}

/**
 * Obtient toutes les permissions d'un utilisateur
 * @param {string} typePersonnel - Type de personnel
 * @returns {object} Permissions par module
 */
function getUserPermissions(typePersonnel) {
  const permissions = {};
  
  Object.keys(modulePermissions).forEach(module => {
    if (hasModuleAccess(typePersonnel, module)) {
      permissions[module] = modulePermissions[module][typePersonnel];
    }
  });
  
  return permissions;
}

/**
 * Obtient les modules accessibles pour un type de personnel
 * @param {string} typePersonnel - Type de personnel
 * @returns {Array} Liste des modules accessibles
 */
function getAccessibleModules(typePersonnel) {
  return Object.keys(modulePermissions).filter(module => 
    hasModuleAccess(typePersonnel, module)
  );
}

/**
 * Obtient les informations de redirection pour un type de personnel
 * Utile pour afficher des messages personnalisés
 * @param {string} typePersonnel - Type de personnel
 * @returns {object} { route, label, description }
 */
function getDefaultRouteInfo(typePersonnel) {
  const routeInfos = {
    'Directeur': {
      route: '/dashboard',
      label: 'Tableau de bord',
      description: 'Vue d\'ensemble de l\'activité du laboratoire'
    },
    'Responsable': {
      route: '/dashboard',
      label: 'Tableau de bord',
      description: 'Gestion et suivi des équipes'
    },
    'Biologiste': {
      route: '/dashboard',
      label: 'Tableau de bord',
      description: 'Suivi de votre activité'
    },
    'Cadre': {
      route: '/dashboard',
      label: 'Tableau de bord',
      description: 'Vue d\'ensemble de votre service'
    },
    'Technicien': {
      route: '/presence',
      label: 'Présence',
      description: 'Consultation de votre historique de présence'
    },
    'Préleveur': {
      route: '/pointage',
      label: 'Pointage',
      description: 'Gestion de vos pointages'
    },
    'Secrétaire': {
      route: '/personnel',
      label: 'Personnel',
      description: 'Gestion administrative du personnel'
    }
  };
  
  return routeInfos[typePersonnel] || {
    route: getFirstAccessibleRoute(typePersonnel),
    label: 'Accueil',
    description: 'Page d\'accueil'
  };
}

module.exports = {
  hasModuleAccess,
  hasPermission,
  canManage,
  injectPermissions,
  checkModuleAccess,
  getDefaultRoute,
  getDefaultRouteInfo,
  getFirstAccessibleRoute,
  getUserPermissions,
  getAccessibleModules,
  modulePermissions
};