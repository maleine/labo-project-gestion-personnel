// ==================== routes/organigramme.js ====================
const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/config');

// Page organigramme
router.get('/', async (req, res) => {
  try {
    res.render('organigramme', { currentPage: 'organigramme' });
  } catch (err) {
    res.status(500).send('Erreur lors du chargement de l\'organigramme');
  }
});

// API pour récupérer les données de l'organigramme
router.get('/api/data', async (req, res) => {
  try {
    const pool = await getConnection();
    
    // Récupérer tous les cadres avec leur hiérarchie
    const cadres = await pool.request().query(`
      SELECT 
        p.id,
        p.matricule,
        CONCAT(p.prenom, ' ', p.nom) as nom_complet,
        p.email,
        p.telephone,
        c.poste,
        c.departement,
        NULL as responsable_id
      FROM Personnel p
      INNER JOIN Cadres c ON p.id = c.personnel_id
      WHERE p.statut = 'Actif'
      ORDER BY 
        CASE 
          WHEN c.poste LIKE '%Directeur%' THEN 1
          WHEN c.poste LIKE '%Responsable%' THEN 2
          WHEN c.poste LIKE '%Chef%' THEN 3
          ELSE 4
        END,
        p.nom
    `);
    
    // Récupérer les équipes
    const equipes = await pool.request().query(`
      SELECT 
        e.id,
        e.nom,
        e.departement,
        e.responsable_id,
        CONCAT(pr.prenom, ' ', pr.nom) as responsable_nom,
        COUNT(me.id) as nombre_membres
      FROM Equipes e
      LEFT JOIN Personnel pr ON e.responsable_id = pr.id
      LEFT JOIN MembresEquipes me ON e.id = me.equipe_id AND me.date_sortie IS NULL
      GROUP BY e.id, e.nom, e.departement, e.responsable_id, pr.prenom, pr.nom
    `);
    
    // Récupérer tous le personnel actif par département
    const personnelParDept = await pool.request().query(`
      SELECT 
        COALESCE(t.departement, c.departement, 'Non assigné') as departement,
        p.type_personnel,
        COUNT(*) as nombre
      FROM Personnel p
      LEFT JOIN Techniciens t ON p.id = t.personnel_id
      LEFT JOIN Cadres c ON p.id = c.personnel_id
      WHERE p.statut = 'Actif'
      GROUP BY COALESCE(t.departement, c.departement, 'Non assigné'), p.type_personnel
      ORDER BY departement, p.type_personnel
    `);
    
    res.json({
      cadres: cadres.recordset,
      equipes: equipes.recordset,
      personnelParDept: personnelParDept.recordset
    });
  } catch (err) {
    console.error('Erreur API organigramme:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;