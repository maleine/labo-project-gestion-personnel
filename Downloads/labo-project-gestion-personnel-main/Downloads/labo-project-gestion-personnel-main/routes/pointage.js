// ==================== routes/pointage.js ====================
const express = require('express');
const router = express.Router();
const Pointage = require('../models/Pointage');
const { requireAuth, requireAdmin } = require('./auth');

// Page principale de pointage
router.get('/', requireAuth, async (req, res) => {
  try {
    const pointageDuJour = await Pointage.getPointageDuJour(req.session.personnelId);
    res.render('pointage', { 
      pointage: pointageDuJour,
      currentPage: 'pointage' 
    });
  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).send('Erreur lors du chargement de la page');
  }
});

// Pointer l'arrivée
router.post('/arrivee', requireAuth, async (req, res) => {
  try {
    await Pointage.pointerArrivee(req.session.personnelId);
    res.json({ success: true, message: 'Arrivée pointée avec succès' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Pointer le départ
router.post('/depart', requireAuth, async (req, res) => {
  try {
    await Pointage.pointerDepart(req.session.personnelId);
    res.json({ success: true, message: 'Départ pointé avec succès' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Obtenir le pointage actuel
router.get('/api/current', requireAuth, async (req, res) => {
  try {
    const pointage = await Pointage.getPointageDuJour(req.session.personnelId);
    res.json({ success: true, pointage });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Historique personnel
router.get('/historique', requireAuth, async (req, res) => {
  try {
    const { dateDebut, dateFin } = req.query;
    const historique = await Pointage.getHistoriqueByPersonnel(
      req.session.personnelId, 
      dateDebut, 
      dateFin
    );
    res.render('pointage-historique', { 
      historique,
      currentPage: 'pointage' 
    });
  } catch (err) {
    res.status(500).send('Erreur lors du chargement de l\'historique');
  }
});

// API Historique
router.get('/api/historique', requireAuth, async (req, res) => {
  try {
    const { dateDebut, dateFin } = req.query;
    const historique = await Pointage.getHistoriqueByPersonnel(
      req.session.personnelId, 
      dateDebut, 
      dateFin
    );
    res.json({ success: true, data: historique });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Page admin - Vue d'ensemble
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const pointagesDuJour = await Pointage.getPointagesDuJour();
    const absences = await Pointage.getAbsences();
    
    res.render('pointage-admin', { 
      pointages: pointagesDuJour,
      absences,
      currentPage: 'pointage-admin' 
    });
  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).send('Erreur lors du chargement de la page admin');
  }
});

// API Pointages du jour (admin)
router.get('/api/admin/today', requireAdmin, async (req, res) => {
  try {
    const pointages = await Pointage.getPointagesDuJour();
    const absences = await Pointage.getAbsences();
    res.json({ success: true, pointages, absences });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Statistiques (admin)
router.get('/api/admin/statistiques', requireAdmin, async (req, res) => {
  try {
    const { dateDebut, dateFin } = req.query;
    const stats = await Pointage.getStatistiques(dateDebut, dateFin);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rapport mensuel
router.get('/api/rapport-mensuel/:personnelId/:mois/:annee', requireAdmin, async (req, res) => {
  try {
    const { personnelId, mois, annee } = req.params;
    const rapport = await Pointage.getRapportMensuel(
      parseInt(personnelId), 
      parseInt(mois), 
      parseInt(annee)
    );
    res.json({ success: true, rapport });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Corriger un pointage (admin)
router.post('/admin/corriger/:id', requireAdmin, async (req, res) => {
  try {
    const { heureArrivee, heureDepart } = req.body;
    await Pointage.corriger(req.params.id, heureArrivee, heureDepart);
    res.json({ success: true, message: 'Pointage corrigé avec succès' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;