// ==================== routes/absences.js ====================
const express = require('express');
const router = express.Router();
const Absence = require('../models/Absence');
const Planning = require('../models/Planning');
const Personnel = require('../models/Personnel');
const { getConnection, sql } = require('../database/config');

// ========== ABSENCES ==========

// Calendrier absences
router.get('/calendrier', async (req, res) => {
  try {
    const mois = parseInt(req.query.mois) || new Date().getMonth() + 1;
    const annee = parseInt(req.query.annee) || new Date().getFullYear();
    
    const absences = await Absence.getCalendrierMois(mois, annee);
    
    res.render('absences/calendrier', { absences, mois, annee });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Liste demandes
router.get('/demandes', async (req, res) => {
  try {
    const demandes = await Absence.getAll(req.query);
    res.render('absences/demandes-list', { demandes });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Détails d'une demande (API)
router.get('/demandes/:id/details', async (req, res) => {
  try {
    const demande = await Absence.getByIdWithDetails(req.params.id);
    
    if (!demande) {
      return res.status(404).json({ 
        success: false, 
        message: 'Demande non trouvée' 
      });
    }

    res.json({ success: true, demande });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Formulaire nouvelle demande
router.get('/demandes/add', async (req, res) => {
  try {
    const personnel = await Personnel.getAll();
    const typesAbsences = await Absence.getTypesAbsences();
    res.render('absences/demandes-form', { personnel, typesAbsences, demande: null });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Créer demande
router.post('/demandes/create', async (req, res) => {
  try {
    await Absence.creerDemande(req.body);
    res.redirect('/absences/demandes');
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Valider demande
router.post('/demandes/:id/valider', async (req, res) => {
  try {
    await Absence.valider(
      req.params.id, 
      req.body.validateur_id, 
      req.body.statut, 
      req.body.commentaire
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Soldes congés
router.get('/soldes', async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .query('SELECT * FROM vw_SoldesCongesActuels ORDER BY personnel_nom');
    res.render('absences/soldes', { soldes: result.recordset });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// ========== PLANNING ==========

// Liste plannings
router.get('/plannings', async (req, res) => {
  try {
    const plannings = await Planning.getAll(req.query.type);
    res.render('absences/plannings-list', { plannings });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire nouveau planning
router.get('/plannings/add', async (req, res) => {
  try {
    const pool = await getConnection();
    const departements = await pool.request()
      .query('SELECT * FROM Departements WHERE statut = \'Actif\'');
    res.render('absences/plannings-form', { 
      planning: null, 
      departements: departements.recordset 
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Créer planning
router.post('/plannings/create', async (req, res) => {
  try {
    await Planning.creer(req.body);
    res.redirect('/absences/plannings');
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Détails planning avec affectations
router.get('/plannings/:id', async (req, res) => {
  try {
    const planning = await Planning.getById(req.params.id);
    const affectations = await Planning.getAffectations(req.params.id);
    const personnel = await Personnel.getAll();
    res.render('absences/plannings-details', { planning, affectations, personnel });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Ajouter affectation
router.post('/plannings/:id/affecter', async (req, res) => {
  try {
    await Planning.ajouterAffectation(req.params.id, req.body);
    res.json({ success: true, message: 'Affectation ajoutée avec succès' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Supprimer une affectation
router.delete('/plannings/affectations/:id', async (req, res) => {
  try {
    await Planning.supprimerAffectation(req.params.id);
    res.json({ success: true, message: 'Affectation supprimée avec succès' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Garde de nuit - Vue semaine
router.get('/garde-nuit', async (req, res) => {
  try {
    const gardes = await Planning.getGardeNuitSemaine();
    res.render('absences/garde-nuit', { gardes });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Publier planning
router.post('/plannings/:id/publier', async (req, res) => {
  try {
    await Planning.publier(req.params.id, req.body.validateur_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Supprimer (annuler) un planning
router.delete('/plannings/:id', async (req, res) => {
  try {
    await Planning.delete(req.params.id);
    res.json({ success: true, message: 'Planning annulé avec succès' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dashboard absences
router.get('/dashboard', async (req, res) => {
  try {
    const pool = await getConnection();
    
    const stats = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM DemandesAbsences WHERE statut = 'En attente') as demandes_attente,
        (SELECT COUNT(*) FROM vw_AbsencesMoisCourant WHERE statut = 'Approuvée') as absences_mois,
        (SELECT COUNT(DISTINCT personnel_id) FROM vw_PlanningGardeNuit) as personnel_garde,
        (SELECT AVG(solde_restant) FROM SoldesConges WHERE annee = YEAR(GETDATE())) as solde_moyen
    `);
    
    res.render('absences/dashboard', { stats: stats.recordset[0] });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

module.exports = router;