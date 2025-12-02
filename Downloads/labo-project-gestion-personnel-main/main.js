// ==================== main.js / app.js avec Module Présence ====================

const { app, BrowserWindow } = require('electron');
const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const { getConnection } = require('./database/config');
const { injectPermissions, checkModuleAccess } = require('./middleware/accessControl');

// ==================== EXPRESS SERVER ====================
const server = express();
const PORT = process.env.PORT || 3000;

// Configuration Express & EJS
server.set('view engine', 'ejs');
server.set('views', path.join(__dirname, 'views'));
server.use(express.static(path.join(__dirname, 'public')));
server.use(express.urlencoded({ extended: true }));
server.use(express.json());
server.use(bodyParser.urlencoded({ extended: true }));
server.use(bodyParser.json());

// ==================== SESSION ====================
server.use(session({
  secret: 'votre_secret_key_ici_changez_moi',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Middleware pour rendre les variables de session disponibles dans les vues
server.use((req, res, next) => {
  res.locals.userId = req.session.userId;
  res.locals.username = req.session.username;
  res.locals.role = req.session.role;
  res.locals.nom = req.session.nom;
  res.locals.prenom = req.session.prenom;
  res.locals.matricule = req.session.matricule;
  res.locals.personnelId = req.session.personnelId;
  res.locals.type_personnel = req.session.type_personnel;
  res.locals.currentPage = req.path.split('/')[1] || 'dashboard';
  res.locals.currentUrl = req.url;
  next();
});

// Injecter les permissions dans toutes les vues
server.use(injectPermissions);

// ==================== ROUTES ====================
const authRoutes = require('./routes/auth');
const personnelRoutes = require('./routes/personnel');
const pointageRoutes = require('./routes/pointage');
const dashboardRoutes = require('./routes/dashboard');
const organigrammeRoutes = require('./routes/organigramme');
const equipesRoutes = require('./routes/equipes');
const rhRoutes = require('./routes/rh');
const absencesRoutes = require('./routes/absences');
const exportsRoutes = require('./routes/exports');
const rapportsRoutes = require('./routes/rapports');
const presenceRoutes = require('./routes/presence');
const { requireAuth } = require('./routes/auth');

// Routes publiques
server.use('/auth', authRoutes);

// Routes protégées avec contrôle d'accès par module
server.use('/personnel', requireAuth, checkModuleAccess('personnel'), personnelRoutes);
server.use('/pointage', requireAuth, checkModuleAccess('pointage'), pointageRoutes);
server.use('/organigramme', requireAuth, checkModuleAccess('organigramme'), organigrammeRoutes);
server.use('/equipes', requireAuth, checkModuleAccess('equipes'), equipesRoutes);
server.use('/rh', requireAuth, checkModuleAccess('rh'), rhRoutes);
server.use('/absences', requireAuth, checkModuleAccess('absences'), absencesRoutes);
server.use('/exports', requireAuth, checkModuleAccess('exports'), exportsRoutes);
server.use('/rapports', requireAuth, checkModuleAccess('rapports'), rapportsRoutes);
server.use('/presence', requireAuth, checkModuleAccess('presence'), presenceRoutes);

// Dashboard route
server.use('/dashboard', requireAuth, checkModuleAccess('dashboard'), dashboardRoutes);

// Page d'accueil - redirection intelligente
server.get('/', (req, res) => {
  if (req.session.userId) {
    const { getDefaultRoute } = require('./middleware/accessControl');
    const defaultRoute = getDefaultRoute(req.session.type_personnel);
    res.redirect(defaultRoute);
  } else {
    res.redirect('/auth/login');
  }
});

// ==================== SYNCHRONISATION AUTOMATIQUE ZKTECO ====================
// Synchronisation toutes les 30 minutes, de 6h à 20h (lundi à vendredi)
cron.schedule('*/30 6-20 * * 1-5', async () => {
  console.log('🔄 Synchronisation automatique ZKTeco...');
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .query('SELECT * FROM AppareilsPointage WHERE statut = \'Actif\'');
    
    if (result.recordset.length === 0) {
      console.log('⚠️  Aucun appareil actif configuré');
      return;
    }

    const ZKTecoService = require('./utils/zktecoService');
    
    for (const appareil of result.recordset) {
      try {
        console.log(`📡 Synchronisation appareil: ${appareil.nom} (${appareil.adresse_ip})`);
        const zkService = new ZKTecoService(appareil.adresse_ip, appareil.port);
        const stats = await zkService.syncAttendances(appareil.id);
        console.log(`✅ Synchro OK: ${stats.nouveaux} nouveaux, ${stats.total} total`);
      } catch (err) {
        console.error(`❌ Erreur appareil ${appareil.nom}:`, err.message);
      }
    }
  } catch (error) {
    console.error('❌ Erreur synchronisation automatique:', error.message);
  }
});

console.log('⏰ Tâche cron configurée: Synchro ZKTeco toutes les 30min (6h-20h, lun-ven)');

// ==================== GESTION DES ERREURS ====================
server.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Page non trouvée',
    message: `La page "${req.url}" n'existe pas`,
    error: { status: 404 },
    currentPage: 'error'
  });
});

server.use((err, req, res, next) => {
  console.error('❌ ERREUR SERVEUR:', err.stack || err.message);
  res.status(err.status || 500).render('error', {
    title: 'Erreur serveur',
    message: err.message || 'Une erreur est survenue',
    error: process.env.NODE_ENV === 'development' ? err : {},
    currentPage: 'error'
  });
});

// ==================== ELECTRON WINDOW ====================
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'public/images/icon.png'),
    title: 'Gestion Personnel Laboratoire - Lab Manager',
    backgroundColor: '#f5f5f5',
    show: false,
    autoHideMenuBar: true
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (process.env.NODE_ENV === 'development') mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => mainWindow = null);

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://localhost:${PORT}`)) event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

// ==================== DATABASE CONNECTION ====================
async function checkDatabaseConnection() {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT @@VERSION as version');
    console.log('✅ Connexion DB réussie:', result.recordset[0].version.split('\n')[0]);
    return true;
  } catch (err) {
    console.error('❌ Connexion DB échouée:', err.message);
    return false;
  }
}

// ==================== APPLICATION STARTUP ====================
app.whenReady().then(async () => {
  console.log('🏥 LAB MANAGER - Démarrage application');
  const dbConnected = await checkDatabaseConnection();

  server.listen(PORT, () => {
    console.log(`🚀 Server Express: http://localhost:${PORT} - DB: ${dbConnected ? '✅ Connectée' : '❌ Déconnectée'}`);
    createWindow();
  });

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

['SIGTERM', 'SIGINT'].forEach(signal => {
  process.on(signal, () => {
    console.log(`🛑 Signal ${signal} reçu, fermeture...`);
    server.close(() => app.quit());
  });
});

process.on('uncaughtException', err => console.error('⚠️  UNCAUGHT EXCEPTION:', err.stack));
process.on('unhandledRejection', (reason) => console.error('⚠️  UNHANDLED REJECTION:', reason));

module.exports = { server, mainWindow };