// ==========================================
// SERVEUR D'ACTIVATION DE LICENCES
// À exécuter séparément: node server-activation.js
// ==========================================
const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Configuration CORS
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration base de données
const dbConfig = {
  user: 'sa',
  password: 'Pass*2018',
  server: 'localhost\\SQLEXPRESS',
  database: 'AdminLicenceDB6',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool;

// Connexion à la base de données
async function connectDB() {
  try {
    pool = await sql.connect(dbConfig);
    console.log('✅ Connecté à AdminLicenceDB6');
    return pool;
  } catch (err) {
    console.error('❌ Erreur connexion DB:', err);
    throw err;
  }
}

// API - Activer une licence
app.post('/api/activate', async (req, res) => {
  const { licenceKey, machineId } = req.body;

  if (!licenceKey || !machineId) {
    return res.json({ 
      success: false, 
      message: 'Clé de licence et Machine ID requis' 
    });
  }

  try {
    // Vérifier si la licence existe
    const result = await pool.request()
      .input('licenceKey', sql.NVarChar, licenceKey.trim())
      .query('SELECT * FROM GeneratedLicences WHERE licenceKey = @licenceKey');

    if (result.recordset.length === 0) {
      return res.json({ 
        success: false, 
        message: 'Clé de licence invalide' 
      });
    }

    const licence = result.recordset[0];

    // Vérifier si déjà activée
    if (licence.status === 'activated' && licence.machineId !== machineId) {
      return res.json({ 
        success: false, 
        message: 'Cette licence est déjà activée sur une autre machine' 
      });
    }

    // Vérifier si expirée
    if (licence.status === 'expired') {
      return res.json({ 
        success: false, 
        message: 'Cette licence a expiré' 
      });
    }

    // Activer la licence
    const activatedAt = new Date();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 an

    await pool.request()
      .input('licenceKey', sql.NVarChar, licenceKey)
      .input('machineId', sql.NVarChar, machineId)
      .input('activatedAt', sql.DateTime, activatedAt)
      .input('expiresAt', sql.DateTime, expiresAt)
      .query(`
        UPDATE GeneratedLicences 
        SET machineId = @machineId,
            activatedAt = @activatedAt,
            expiresAt = @expiresAt,
            status = 'activated'
        WHERE licenceKey = @licenceKey
      `);

    // Enregistrer dans l'historique
    await pool.request()
      .input('licenceId', sql.Int, licence.id)
      .input('action', sql.NVarChar, 'ACTIVATION')
      .input('description', sql.NVarChar, `Activation sur machine ${machineId}`)
      .query(`
        INSERT INTO LicenceHistory (licenceId, action, description)
        VALUES (@licenceId, @action, @description)
      `);

    console.log(`✅ Licence activée: ${licenceKey} -> ${machineId}`);

    res.json({ 
      success: true, 
      message: 'Licence activée avec succès',
      licence: {
        licenceKey: licenceKey,
        machineId: machineId,
        activatedAt: activatedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        status: 'activated'
      }
    });

  } catch (err) {
    console.error('❌ Erreur activation:', err);
    res.json({ 
      success: false, 
      message: 'Erreur serveur lors de l\'activation' 
    });
  }
});

// API - Vérifier le statut d'une licence
app.post('/api/check-status', async (req, res) => {
  const { machineId } = req.body;

  if (!machineId) {
    return res.json({ activated: false });
  }

  try {
    const result = await pool.request()
      .input('machineId', sql.NVarChar, machineId)
      .query(`
        SELECT * FROM GeneratedLicences 
        WHERE machineId = @machineId 
        AND status = 'activated'
        AND expiresAt > GETDATE()
      `);

    if (result.recordset.length > 0) {
      const licence = result.recordset[0];
      return res.json({ 
        activated: true,
        licence: {
          licenceKey: licence.licenceKey,
          machineId: licence.machineId,
          activatedAt: licence.activatedAt,
          expiresAt: licence.expiresAt,
          status: licence.status
        }
      });
    }

    res.json({ activated: false });

  } catch (err) {
    console.error('❌ Erreur vérification:', err);
    res.json({ activated: false });
  }
});

// Page d'administration
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Serveur d'Activation</title>
        <style>
          body { font-family: Arial; padding: 40px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          h1 { color: #333; }
          .status { padding: 15px; background: #d4edda; border-radius: 5px; margin: 20px 0; }
          code { background: #f0f0f0; padding: 3px 8px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔐 Serveur d'Activation de Licences</h1>
          <div class="status">
            <strong>✅ Serveur actif</strong><br>
            Port: ${PORT}<br>
            Base de données: AdminLicenceDB6
          </div>
          <h3>Endpoints API:</h3>
          <ul>
            <li><code>POST /api/activate</code> - Activer une licence</li>
            <li><code>POST /api/check-status</code> - Vérifier le statut</li>
          </ul>
          <p>
            <a href="/admin">Accéder au panneau d'administration</a>
          </p>
        </div>
      </body>
    </html>
  `);
});

// Démarrage du serveur
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Serveur d'activation démarré sur http://localhost:${PORT}`);
    console.log(`📊 Base de données: AdminLicenceDB6`);
  });
}).catch(err => {
  console.error('❌ Impossible de démarrer le serveur:', err);
  process.exit(1);
});

// Gestion de la fermeture
process.on('SIGINT', async () => {
  console.log('🛑 Arrêt du serveur...');
  if (pool) await pool.close();
  process.exit(0);
});