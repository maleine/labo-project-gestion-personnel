// ==================== routes/personnel.js ====================
const express = require('express');
const router = express.Router();
const Personnel = require('../models/Personnel');
const { getConnection, sql } = require('../database/config');

// List page
router.get('/list', (req, res) => {
  res.render('personnel-list', { currentPage: 'personnel-list' });
});

// API endpoint for DataTables
router.get('/api/list', async (req, res) => {
  try {
    const personnel = await Personnel.getAll();
    res.json({ data: personnel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add page
router.get('/add', (req, res) => {
  res.render('personnel-add', { currentPage: 'personnel-add' });
});

// Edit page
router.get('/edit/:id', async (req, res) => {
  try {
    const personnel = await Personnel.getById(req.params.id);
    
    // Get specific data based on type
    const pool = await getConnection();
    let specificData = null;
    
    if (personnel.type_personnel === 'Biologiste') {
      const result = await pool.request()
        .input('personnel_id', sql.Int, req.params.id)
        .query('SELECT * FROM Biologistes WHERE personnel_id = @personnel_id');
      specificData = result.recordset[0];
    } else if (personnel.type_personnel === 'Technicien') {
      const result = await pool.request()
        .input('personnel_id', sql.Int, req.params.id)
        .query('SELECT * FROM Techniciens WHERE personnel_id = @personnel_id');
      specificData = result.recordset[0];
    } else if (personnel.type_personnel === 'Cadre') {
      const result = await pool.request()
        .input('personnel_id', sql.Int, req.params.id)
        .query('SELECT * FROM Cadres WHERE personnel_id = @personnel_id');
      specificData = result.recordset[0];
    }
    
    res.render('personnel-edit', { personnel, specificData, currentPage: 'personnel-list' });
  } catch (err) {
    res.status(500).send('Erreur lors de la récupération du personnel');
  }
});

// Create personnel
router.post('/create', async (req, res) => {
  try {
    const personnelId = await Personnel.create(req.body);
    const pool = await getConnection();
    
    // Insert type-specific data
    if (req.body.type_personnel === 'Biologiste') {
      await pool.request()
        .input('personnel_id', sql.Int, personnelId)
        .input('specialite', sql.VarChar, req.body.specialite)
        .input('responsable_assurance_qualite', sql.Bit, req.body.responsable_assurance_qualite ? 1 : 0)
        .query(`
          INSERT INTO Biologistes (personnel_id, specialite, responsable_assurance_qualite)
          VALUES (@personnel_id, @specialite, @responsable_assurance_qualite)
        `);
    } else if (req.body.type_personnel === 'Technicien') {
      await pool.request()
        .input('personnel_id', sql.Int, personnelId)
        .input('departement', sql.VarChar, req.body.departement)
        .input('poste_nuit', sql.Bit, req.body.poste_nuit ? 1 : 0)
        .query(`
          INSERT INTO Techniciens (personnel_id, departement, poste_nuit)
          VALUES (@personnel_id, @departement, @poste_nuit)
        `);
    } else if (req.body.type_personnel === 'Cadre') {
      await pool.request()
        .input('personnel_id', sql.Int, personnelId)
        .input('poste', sql.VarChar, req.body.poste)
        .input('departement', sql.VarChar, req.body.departement_cadre)
        .query(`
          INSERT INTO Cadres (personnel_id, poste, departement)
          VALUES (@personnel_id, @poste, @departement)
        `);
    }
    
    res.redirect('/personnel/list');
  } catch (err) {
    res.status(500).send('Erreur lors de la création: ' + err.message);
  }
});

// Update personnel
router.post('/update/:id', async (req, res) => {
  try {
    await Personnel.update(req.params.id, req.body);
    
    const pool = await getConnection();
    
    // Update type-specific data
    if (req.body.type_personnel === 'Biologiste') {
      await pool.request()
        .input('personnel_id', sql.Int, req.params.id)
        .input('specialite', sql.VarChar, req.body.specialite)
        .input('responsable_assurance_qualite', sql.Bit, req.body.responsable_assurance_qualite ? 1 : 0)
        .query(`
          UPDATE Biologistes 
          SET specialite = @specialite, responsable_assurance_qualite = @responsable_assurance_qualite
          WHERE personnel_id = @personnel_id
        `);
    } else if (req.body.type_personnel === 'Technicien') {
      await pool.request()
        .input('personnel_id', sql.Int, req.params.id)
        .input('departement', sql.VarChar, req.body.departement)
        .input('poste_nuit', sql.Bit, req.body.poste_nuit ? 1 : 0)
        .query(`
          UPDATE Techniciens 
          SET departement = @departement, poste_nuit = @poste_nuit
          WHERE personnel_id = @personnel_id
        `);
    } else if (req.body.type_personnel === 'Cadre') {
      await pool.request()
        .input('personnel_id', sql.Int, req.params.id)
        .input('poste', sql.VarChar, req.body.poste)
        .input('departement', sql.VarChar, req.body.departement_cadre)
        .query(`
          UPDATE Cadres 
          SET poste = @poste, departement = @departement
          WHERE personnel_id = @personnel_id
        `);
    }
    
    res.redirect('/personnel/list');
  } catch (err) {
    res.status(500).send('Erreur lors de la mise à jour');
  }
});

// Delete personnel
router.delete('/delete/:id', async (req, res) => {
  try {
    await Personnel.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get personnel details (for modal/ajax)
router.get('/details/:id', async (req, res) => {
  try {
    const personnel = await Personnel.getById(req.params.id);
    const pool = await getConnection();
    
    let details = { ...personnel };
    
    if (personnel.type_personnel === 'Biologiste') {
      const result = await pool.request()
        .input('personnel_id', sql.Int, req.params.id)
        .query(`
          SELECT b.*, 
                 STRING_AGG(sb.specialite, ', ') as specialites_supplementaires
          FROM Biologistes b
          LEFT JOIN SpecialitesBiologistes sb ON b.id = sb.biologiste_id
          WHERE b.personnel_id = @personnel_id
          GROUP BY b.id, b.personnel_id, b.specialite, b.responsable_assurance_qualite, b.created_at
        `);
      details.biologiste = result.recordset[0];
    } else if (personnel.type_personnel === 'Technicien') {
      const result = await pool.request()
        .input('personnel_id', sql.Int, req.params.id)
        .query('SELECT * FROM Techniciens WHERE personnel_id = @personnel_id');
      details.technicien = result.recordset[0];
    } else if (personnel.type_personnel === 'Cadre') {
      const result = await pool.request()
        .input('personnel_id', sql.Int, req.params.id)
        .query('SELECT * FROM Cadres WHERE personnel_id = @personnel_id');
      details.cadre = result.recordset[0];
    }
    
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Statistics endpoint
router.get('/api/statistics', async (req, res) => {
  try {
    const pool = await getConnection();
    
    const stats = await pool.request().query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN type_personnel = 'Biologiste' THEN 1 ELSE 0 END) as biologistes,
        SUM(CASE WHEN type_personnel = 'Technicien' THEN 1 ELSE 0 END) as techniciens,
        SUM(CASE WHEN type_personnel = 'Cadre' THEN 1 ELSE 0 END) as cadres,
        SUM(CASE WHEN type_personnel = 'Secrétaire' THEN 1 ELSE 0 END) as secretaires,
        SUM(CASE WHEN type_personnel = 'Préleveur' THEN 1 ELSE 0 END) as preleveurs,
        SUM(CASE WHEN type_personnel = 'Agent Logistique' THEN 1 ELSE 0 END) as agents_logistiques
      FROM Personnel 
      WHERE statut = 'Actif'
    `);
    
    res.json(stats.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ==================== À ajouter dans routes/personnel.js ====================

// Route API pour récupérer les détails d'un personnel (pour le modal)
router.get('/api/:id', async (req, res) => {
  try {
    const personnel = await Personnel.getById(req.params.id);
    
    if (!personnel) {
      return res.status(404).json({ 
        success: false, 
        message: 'Personnel non trouvé' 
      });
    }
    
    res.json({ 
      success: true, 
      personnel: personnel 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


module.exports = router;