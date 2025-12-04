// ==================== routes/personnel.js (MISE À JOUR) ====================
const express = require('express');
const router = express.Router();
const Personnel = require('../models/Personnel');
const Departement = require('../models/Departement');
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

// Add page - MODIFIÉ pour charger les départements
router.get('/add', async (req, res) => {
  try {
    const departements = await Departement.getAll();
    res.render('personnel-add', { 
      currentPage: 'personnel-add',
      departements: departements 
    });
  } catch (err) {
    console.error('Erreur lors du chargement des départements:', err);
    res.render('personnel-add', { 
      currentPage: 'personnel-add',
      departements: [] 
    });
  }
});

// Edit page - MODIFIÉ pour charger les départements
router.get('/edit/:id', async (req, res) => {
  try {
    const personnel = await Personnel.getById(req.params.id);
    const departements = await Departement.getAll();
    
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
    
    res.render('personnel-edit', { 
      personnel, 
      specificData, 
      departements,
      currentPage: 'personnel-list' 
    });
  } catch (err) {
    res.status(500).send('Erreur lors de la récupération du personnel');
  }
});

// ==================== routes/personnel.js (ROUTE CREATE MODIFIÉE) ====================

// Remplacer la route POST '/create' par celle-ci :

// Créer personnel avec affectation poste optionnelle
router.post('/create', async (req, res) => {
  const pool = await getConnection();
  const transaction = pool.transaction();
  
  try {
    await transaction.begin();
    
    // 1. Créer le personnel
    const personnelId = await Personnel.create(req.body);
    console.log('Personnel créé avec ID:', personnelId);
    
    // 2. Insérer les données spécifiques selon le type
    if (req.body.type_personnel === 'Biologiste') {
      await transaction.request()
        .input('personnel_id', sql.Int, personnelId)
        .input('specialite', sql.VarChar, req.body.specialite || null)
        .input('responsable_assurance_qualite', sql.Bit, req.body.responsable_assurance_qualite ? 1 : 0)
        .query(`
          INSERT INTO Biologistes (personnel_id, specialite, responsable_assurance_qualite)
          VALUES (@personnel_id, @specialite, @responsable_assurance_qualite)
        `);
    } else if (req.body.type_personnel === 'Technicien') {
      await transaction.request()
        .input('personnel_id', sql.Int, personnelId)
        .input('departement', sql.VarChar, req.body.departement || null)
        .input('poste_nuit', sql.Bit, req.body.poste_nuit ? 1 : 0)
        .query(`
          INSERT INTO Techniciens (personnel_id, departement, poste_nuit)
          VALUES (@personnel_id, @departement, @poste_nuit)
        `);
    } else if (req.body.type_personnel === 'Cadre') {
      await transaction.request()
        .input('personnel_id', sql.Int, personnelId)
        .input('poste', sql.VarChar, req.body.poste || null)
        .input('departement', sql.VarChar, req.body.departement_cadre || null)
        .query(`
          INSERT INTO Cadres (personnel_id, poste, departement)
          VALUES (@personnel_id, @poste, @departement)
        `);
    }
    
    // 3. Affecter à un poste si spécifié
    if (req.body.poste_id && req.body.poste_id !== '') {
      const posteId = parseInt(req.body.poste_id);
      const dateDebut = req.body.date_debut_affectation || req.body.date_embauche;
      const notes = req.body.notes_affectation || null;
      
      console.log('Affectation au poste:', { posteId, personnelId, dateDebut, notes });
      
      // Vérifier la disponibilité du poste
      const checkResult = await transaction.request()
        .input('poste_id', sql.Int, posteId)
        .query(`
          SELECT 
            p.nb_postes_disponibles,
            COUNT(ap.id) as postes_occupes,
            p.titre
          FROM Postes p
          LEFT JOIN AffectationsPostes ap ON p.id = ap.poste_id AND ap.statut = 'En cours'
          WHERE p.id = @poste_id
          GROUP BY p.nb_postes_disponibles, p.titre
        `);
      
      if (checkResult.recordset.length === 0) {
        throw new Error('Poste non trouvé');
      }
      
      const posteStats = checkResult.recordset[0];
      if (posteStats.postes_occupes >= posteStats.nb_postes_disponibles) {
        throw new Error(`Le poste "${posteStats.titre}" est complet (${posteStats.nb_postes_disponibles} place(s) disponible(s))`);
      }
      
      // Créer l'affectation
      await transaction.request()
        .input('poste_id', sql.Int, posteId)
        .input('personnel_id', sql.Int, personnelId)
        .input('date_debut', sql.Date, dateDebut)
        .input('notes', sql.Text, notes)
        .query(`
          INSERT INTO AffectationsPostes (poste_id, personnel_id, date_debut, statut, notes)
          VALUES (@poste_id, @personnel_id, @date_debut, 'En cours', @notes)
        `);
      
      console.log('Affectation créée avec succès');
    }
    
    await transaction.commit();
    
    res.redirect('/personnel/list?success=Personnel créé avec succès' + 
                 (req.body.poste_id ? ' et affecté au poste' : ''));
    
  } catch (err) {
    await transaction.rollback();
    console.error('Erreur lors de la création:', err);
    res.status(500).send('Erreur lors de la création: ' + err.message);
  }
});

// AJOUTER cette nouvelle route API pour charger les postes disponibles
router.get('/api/postes-disponibles', async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        p.id, p.code, p.titre, p.departement_id, p.niveau,
        d.nom as departement_nom,
        p.nb_postes_disponibles,
        COUNT(ap.id) as postes_occupes,
        (p.nb_postes_disponibles - COUNT(ap.id)) as postes_vacants
      FROM Postes p
      LEFT JOIN Departements d ON p.departement_id = d.id
      LEFT JOIN AffectationsPostes ap ON p.id = ap.poste_id AND ap.statut = 'En cours'
      WHERE p.statut = 'Actif'
      GROUP BY p.id, p.code, p.titre, p.departement_id, p.niveau, d.nom, p.nb_postes_disponibles
      HAVING (p.nb_postes_disponibles - COUNT(ap.id)) > 0
      ORDER BY d.nom, p.titre
    `);
    
    res.json({
      success: true,
      postes: result.recordset
    });
  } catch (err) {
    console.error('Erreur chargement postes:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});
// Update personnel - INCHANGÉ (le modèle gère déjà departement_id)
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

// API pour récupérer les détails d'un personnel
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