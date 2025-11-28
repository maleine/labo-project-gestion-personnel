// ==================== routes/rapports.js ====================
const express = require('express');
const router = express.Router();
const Rapport = require('../models/Rapports');

// Page principale
router.get('/', (req, res) => {
  res.render('rapports', { currentPage: 'rapports' });
});

// API: Statistiques détaillées
router.get('/api/detailed-stats', async (req, res) => {
  try {
    const stats = await Rapport.getDetailedStatistics();
    res.json(stats);
  } catch (err) {
    console.error('Erreur lors de la récupération des statistiques:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// API: Statistiques par département
router.get('/api/stats-by-department', async (req, res) => {
  try {
    const stats = await Rapport.getStatsByDepartment();
    res.json(stats);
  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// API: Statistiques par type de personnel
router.get('/api/stats-by-type', async (req, res) => {
  try {
    const stats = await Rapport.getStatsByType();
    res.json(stats);
  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// API: Évolution du personnel
router.get('/api/evolution', async (req, res) => {
  try {
    const { period = 'year' } = req.query;
    const evolution = await Rapport.getEvolution(period);
    res.json(evolution);
  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// API: Analyse d'ancienneté
router.get('/api/anciennete', async (req, res) => {
  try {
    const anciennete = await Rapport.getAncienneteAnalysis();
    res.json(anciennete);
  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// API: Répartition par genre
router.get('/api/gender-distribution', async (req, res) => {
  try {
    const distribution = await Rapport.getGenderDistribution();
    res.json(distribution);
  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// API: Rapport personnalisé
router.post('/api/custom-report', async (req, res) => {
  try {
    const { type, filters } = req.body;
    const report = await Rapport.generateCustomReport(type, filters);
    res.json(report);
  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de la génération du rapport' });
  }
});

// Export Excel
router.get('/export/excel', async (req, res) => {
  try {
    const { type = 'general' } = req.query;
    const excelData = await Rapport.exportToExcel(type);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=rapport_${type}_${Date.now()}.xlsx`);
    res.send(excelData);
  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de l\'export' });
  }
});

// Export PDF
router.get('/export/pdf', async (req, res) => {
  try {
    const { type = 'general' } = req.query;
    const pdfData = await Rapport.exportToPDF(type);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=rapport_${type}_${Date.now()}.pdf`);
    res.send(pdfData);
  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).json({ error: 'Erreur lors de l\'export' });
  }
});

// Statistiques tableau de bord
router.get('/api/dashboard-stats', async (req, res) => {
  try {
    const dashboardStats = await Rapport.getDashboardStatistics();
    res.json(dashboardStats);
  } catch (err) {
    console.error('Erreur:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;