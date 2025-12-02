// ==================== routes/equipes.js ====================
const express = require('express');
const router = express.Router();
const Equipe = require('../models/Equipes');

// Page principale
router.get('/', (req, res) => {
  res.render('equipes', { currentPage: 'equipes' });
});

// API: Liste des équipes avec statistiques
router.get('/api/list', async (req, res) => {
  try {
    const equipes = await Equipe.getAllWithStats();
    res.json(equipes);
  } catch (err) {
    console.error('Erreur lors de la récupération des équipes:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// API: Détails d'une équipe avec membres
router.get('/api/details/:id', async (req, res) => {
  try {
    const equipe = await Equipe.getDetailsWithMembers(req.params.id);
    if (!equipe) {
      return res.status(404).json({ error: 'Équipe non trouvée' });
    }
    res.json(equipe);
  } catch (err) {
    console.error('Erreur lors de la récupération des détails:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer une équipe
router.post('/create', async (req, res) => {
  try {
    const { nom, departement, responsable_id, description } = req.body;
    
    if (!nom || !departement || !responsable_id) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const equipeId = await Equipe.create({
      nom,
      departement,
      responsable_id,
      description
    });

    res.json({ 
      success: true, 
      id: equipeId,
      message: 'Équipe créée avec succès' 
    });
  } catch (err) {
    console.error('Erreur lors de la création:', err);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
});

// Mettre à jour une équipe
router.put('/update/:id', async (req, res) => {
  try {
    const { nom, departement, responsable_id, description } = req.body;
    
    await Equipe.update(req.params.id, {
      nom,
      departement,
      responsable_id,
      description
    });

    res.json({ success: true, message: 'Équipe mise à jour' });
  } catch (err) {
    console.error('Erreur lors de la mise à jour:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// Supprimer une équipe
router.delete('/delete/:id', async (req, res) => {
  try {
    await Equipe.delete(req.params.id);
    res.json({ success: true, message: 'Équipe supprimée' });
  } catch (err) {
    console.error('Erreur lors de la suppression:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// Ajouter un membre à une équipe
router.post('/add-member', async (req, res) => {
  try {
    const { equipe_id, personnel_id } = req.body;
    
    if (!equipe_id || !personnel_id) {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    await Equipe.addMember(equipe_id, personnel_id);
    res.json({ success: true, message: 'Membre ajouté' });
  } catch (err) {
    console.error('Erreur lors de l\'ajout du membre:', err);
    res.status(500).json({ error: 'Erreur lors de l\'ajout' });
  }
});

// Retirer un membre d'une équipe
router.delete('/remove-member/:equipe_id/:personnel_id', async (req, res) => {
  try {
    await Equipe.removeMember(req.params.equipe_id, req.params.personnel_id);
    res.json({ success: true, message: 'Membre retiré' });
  } catch (err) {
    console.error('Erreur lors du retrait:', err);
    res.status(500).json({ error: 'Erreur lors du retrait' });
  }
});

// Statistiques des équipes
router.get('/api/statistics', async (req, res) => {
  try {
    const stats = await Equipe.getStatistics();
    res.json(stats);
  } catch (err) {
    console.error('Erreur lors de la récupération des statistiques:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;