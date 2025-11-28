// ==================== routes/dashboard.js ====================
const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/config');

// Fonction helper pour calculer le pourcentage
function calculatePercentage(value, max = 100) {
  const basePercentage = (value / max) * 100;
  return Math.min(basePercentage, 100);
}

// Route principale du dashboard
router.get('/', async (req, res) => {
  try {
    const pool = await getConnection();
    
    // Récupérer les statistiques globales
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN type_personnel = 'Biologiste' THEN 1 ELSE 0 END) as biologistes,
        SUM(CASE WHEN type_personnel = 'Technicien' THEN 1 ELSE 0 END) as techniciens,
        SUM(CASE WHEN type_personnel = 'Cadre' THEN 1 ELSE 0 END) as cadres
      FROM Personnel
      WHERE statut = 'Actif'
    `;
    
    const statsResult = await pool.request().query(statsQuery);
    const stats = statsResult.recordset[0];
    
    // Récupérer les statistiques par département
    const departementsQuery = `
      SELECT 
        t.departement,
        COUNT(*) as nombre_personnel
      FROM Techniciens t
      INNER JOIN Personnel p ON t.personnel_id = p.id
      WHERE p.statut = 'Actif'
      GROUP BY t.departement
      
      UNION ALL
      
      SELECT 
        c.departement,
        COUNT(*) as nombre_personnel
      FROM Cadres c
      INNER JOIN Personnel p ON c.personnel_id = p.id
      WHERE p.statut = 'Actif' AND c.departement IS NOT NULL
      GROUP BY c.departement
    `;
    
    const departementsResult = await pool.request().query(departementsQuery);
    
    // Organiser les données par département
    const departements = {
      'Biologie Délocalisée': 0,
      'Biochimie': 0,
      'Hématologie': 0,
      'Microbiologie': 0,
      'Immuno-Séro-Electro': 0,
      'Garde Nuit': 0
    };
    
    departementsResult.recordset.forEach(row => {
      if (departements.hasOwnProperty(row.departement)) {
        departements[row.departement] += row.nombre_personnel;
      }
    });
    
    // Récupérer les activités récentes (derniers ajouts/modifications)
    const activitiesQuery = `
      SELECT TOP 5
        p.id,
        p.nom,
        p.prenom,
        p.type_personnel,
        p.created_at,
        p.updated_at,
        CASE 
          WHEN DATEDIFF(HOUR, p.created_at, GETDATE()) < 1 THEN 'Il y a ' + CAST(DATEDIFF(MINUTE, p.created_at, GETDATE()) AS VARCHAR) + ' minutes'
          WHEN DATEDIFF(HOUR, p.created_at, GETDATE()) < 24 THEN 'Il y a ' + CAST(DATEDIFF(HOUR, p.created_at, GETDATE()) AS VARCHAR) + ' heures'
          WHEN DATEDIFF(DAY, p.created_at, GETDATE()) = 1 THEN 'Hier'
          ELSE 'Il y a ' + CAST(DATEDIFF(DAY, p.created_at, GETDATE()) AS VARCHAR) + ' jours'
        END as temps_ecoule,
        CASE 
          WHEN CAST(p.created_at AS DATE) = CAST(p.updated_at AS DATE) THEN 'ajouté'
          ELSE 'modifié'
        END as action
      FROM Personnel p
      ORDER BY p.updated_at DESC
    `;
    
    const activitiesResult = await pool.request().query(activitiesQuery);
    const activities = activitiesResult.recordset;
    
    res.render('dashboard', {
      stats,
      departements,
      activities
    });
    
  } catch (err) {
    console.error('Erreur lors du chargement du dashboard:', err);
    res.status(500).render('error', { 
      message: 'Erreur lors du chargement du dashboard',
      error: err 
    });
  }
});

// API endpoint pour les statistiques (pour rechargement dynamique)
router.get('/api/statistics', async (req, res) => {
  try {
    const pool = await getConnection();
    
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN type_personnel = 'Biologiste' THEN 1 ELSE 0 END) as biologistes,
        SUM(CASE WHEN type_personnel = 'Technicien' THEN 1 ELSE 0 END) as techniciens,
        SUM(CASE WHEN type_personnel = 'Cadre' THEN 1 ELSE 0 END) as cadres
      FROM Personnel
      WHERE statut = 'Actif'
    `;
    
    const result = await pool.request().query(statsQuery);
    res.json(result.recordset[0]);
    
  } catch (err) {
    console.error('Erreur API statistics:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;