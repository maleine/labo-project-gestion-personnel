// ==================== routes/auth.js (MISE À JOUR) ====================
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { getDefaultRoute } = require('../middleware/accessControl');

// Page de connexion
router.get('/login', (req, res) => {
  if (req.session.userId) {
    const defaultRoute = getDefaultRoute(req.session.type_personnel);
    return res.redirect(defaultRoute);
  }
  res.render('login', { error: null });
});

// Traitement de la connexion
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Vérifier si l'utilisateur existe
    const user = await User.findByUsername(username);
    
    if (!user) {
      return res.render('login', { 
        error: 'Nom d\'utilisateur ou mot de passe incorrect' 
      });
    }
    
    // Vérifier le mot de passe
    const isValidPassword = await User.verifyPassword(password, user.password);
    
    if (!isValidPassword) {
      return res.render('login', { 
        error: 'Nom d\'utilisateur ou mot de passe incorrect' 
      });
    }

    // Récupérer le type_personnel depuis Personnel
    const Personnel = require('../models/Personnel');
    const personnel = await Personnel.getById(user.personnel_id);
    
    if (!personnel) {
      return res.render('login', { 
        error: 'Impossible de récupérer les informations du personnel.' 
      });
    }
    
    // Créer la session complète
    req.session.userId = user.id;
    req.session.personnelId = user.personnel_id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.nom = user.nom;
    req.session.prenom = user.prenom;
    req.session.matricule = user.matricule;
    req.session.type_personnel = personnel.type_personnel;
    
    // Mettre à jour la dernière connexion
    await User.updateLastLogin(user.id);

    // Redirection selon le type_personnel
    const defaultRoute = getDefaultRoute(personnel.type_personnel);
    return res.redirect(defaultRoute);

  } catch (err) {
    console.error('Erreur de connexion:', err);
    res.render('login', { 
      error: 'Une erreur est survenue lors de la connexion' 
    });
  }
});

// Page d'inscription
router.get('/register', (req, res) => {
  res.render('register', { error: null, success: null });
});

// Traitement de l'inscription
router.post('/register', async (req, res) => {
  try {
    const { username, password, confirmPassword, matricule } = req.body;
    
    // Validations
    if (password !== confirmPassword) {
      return res.render('register', { 
        error: 'Les mots de passe ne correspondent pas',
        success: null 
      });
    }
    
    if (password.length < 6) {
      return res.render('register', { 
        error: 'Le mot de passe doit contenir au moins 6 caractères',
        success: null 
      });
    }
    
    // Vérifier si le username existe déjà
    const usernameExists = await User.usernameExists(username);
    if (usernameExists) {
      return res.render('register', { 
        error: 'Ce nom d\'utilisateur est déjà utilisé',
        success: null 
      });
    }
    
    // Vérifier si le matricule existe dans Personnel
    const Personnel = require('../models/Personnel');
    const personnel = await Personnel.getAll();
    const personnelMatch = personnel.find(p => p.matricule === matricule);
    
    if (!personnelMatch) {
      return res.render('register', { 
        error: 'Matricule non trouvé. Veuillez contacter l\'administrateur.',
        success: null 
      });
    }
    
    // Créer l'utilisateur
    await User.create({
      personnel_id: personnelMatch.id,
      username: username,
      password: password,
      role: 'user'
    });
    
    res.render('register', { 
      error: null,
      success: 'Inscription réussie ! Vous pouvez maintenant vous connecter.' 
    });
  } catch (err) {
    console.error('Erreur d\'inscription:', err);
    res.render('register', { 
      error: 'Une erreur est survenue lors de l\'inscription',
      success: null 
    });
  }
});

// Déconnexion
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Erreur de déconnexion:', err);
    }
    res.redirect('/auth/login');
  });
});

// Middleware de vérification d'authentification
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/auth/login');
  }
  next();
}

// Middleware de vérification du rôle admin
function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.status(403).send('Accès refusé');
  }
  next();
}

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireAdmin = requireAdmin;