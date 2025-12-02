// ==================== routes/organigramme.js ====================
const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/config');

// Page organigramme
router.get('/', async (req, res) => {
  try {
    res.render('organigramme', { currentPage: 'organigramme' });
  } catch (err) {
    console.error('Erreur chargement page:', err);
    res.status(500).send('Erreur lors du chargement de l\'organigramme');
  }
});

// API pour récupérer les données de l'organigramme
router.get('/api/data', async (req, res) => {
  try {
    const pool = await getConnection();
    
    // 1. Direction (DCGS) - Rechercher un cadre avec le poste de direction
    const directionResult = await pool.request().query(`
      SELECT TOP 1
        p.id,
        p.matricule,
        CONCAT(p.prenom, ' ', p.nom) as nom_complet,
        p.email,
        p.telephone,
        c.poste as role
      FROM Personnel p
      INNER JOIN Cadres c ON p.id = c.personnel_id
      WHERE p.statut = 'Actif'
        AND (c.poste LIKE '%Directeur%' OR c.poste LIKE '%Direction%' OR c.poste LIKE '%DCGS%')
      ORDER BY p.id
    `);
    
    // 2. Responsables (Cadres et Biologistes responsables)
    const responsablesResult = await pool.request().query(`
      SELECT 
        p.id,
        p.matricule,
        CONCAT(p.prenom, ' ', p.nom) as nom_complet,
        p.email,
        p.telephone,
        p.type_personnel,
        COALESCE(c.poste, b.specialite) as role,
        COALESCE(c.departement, b.specialite) as departement
      FROM Personnel p
      LEFT JOIN Cadres c ON p.id = c.personnel_id
      LEFT JOIN Biologistes b ON p.id = b.personnel_id AND b.responsable_assurance_qualite = 1
      WHERE p.statut = 'Actif'
        AND (
          (c.poste LIKE '%Responsable%' OR c.poste LIKE '%Chef%')
          OR b.responsable_assurance_qualite = 1
        )
      ORDER BY p.type_personnel, p.nom
    `);
    
    // 3. Biologistes groupés par spécialité
    const biologistesResult = await pool.request().query(`
      SELECT 
        p.id,
        p.matricule,
        CONCAT(p.prenom, ' ', p.nom) as nom_complet,
        p.email,
        p.telephone,
        b.specialite
      FROM Personnel p
      INNER JOIN Biologistes b ON p.id = b.personnel_id
      WHERE p.statut = 'Actif'
        AND p.type_personnel = 'Biologiste'
      ORDER BY b.specialite, p.nom
    `);
    
    // Grouper biologistes par spécialité
    const biologistesParSpecialite = {};
    biologistesResult.recordset.forEach(bio => {
      const spec = bio.specialite || 'Non spécifié';
      if (!biologistesParSpecialite[spec]) {
        biologistesParSpecialite[spec] = [];
      }
      biologistesParSpecialite[spec].push(bio);
    });
    
    // 4. Techniciens groupés par département
    const techniciensResult = await pool.request().query(`
      SELECT 
        p.id,
        p.matricule,
        CONCAT(p.prenom, ' ', p.nom) as nom_complet,
        p.email,
        p.telephone,
        t.departement,
        t.poste_nuit
      FROM Personnel p
      INNER JOIN Techniciens t ON p.id = t.personnel_id
      WHERE p.statut = 'Actif'
        AND p.type_personnel = 'Technicien'
      ORDER BY t.departement, p.nom
    `);
    
    // Grouper techniciens par département
    const techniciensParDepartement = {};
    const gardeNuit = [];
    
    techniciensResult.recordset.forEach(tech => {
      if (tech.poste_nuit) {
        gardeNuit.push(tech);
      }
      
      const dept = tech.departement || 'Non assigné';
      if (!techniciensParDepartement[dept]) {
        techniciensParDepartement[dept] = [];
      }
      techniciensParDepartement[dept].push(tech);
    });
    
    // 5. Personnel de support
    const supportResult = await pool.request().query(`
      SELECT 
        p.id,
        p.matricule,
        CONCAT(p.prenom, ' ', p.nom) as nom_complet,
        p.email,
        p.telephone,
        p.type_personnel
      FROM Personnel p
      WHERE p.statut = 'Actif'
        AND p.type_personnel IN ('Secrétaire', 'Préleveur', 'Agent Logistique')
      ORDER BY p.type_personnel, p.nom
    `);
    
    // Grouper le support par type
    const secretaires = [];
    const preleveurs = [];
    const agents = [];
    
    supportResult.recordset.forEach(person => {
      if (person.type_personnel === 'Secrétaire') {
        secretaires.push(person);
      } else if (person.type_personnel === 'Préleveur') {
        preleveurs.push(person);
      } else if (person.type_personnel === 'Agent Logistique') {
        agents.push(person);
      }
    });
    
    // 6. Statistiques
    const statsResult = await pool.request().query(`
      SELECT 
        type_personnel,
        COUNT(*) as actifs
      FROM Personnel
      WHERE statut = 'Actif'
      GROUP BY type_personnel
      ORDER BY type_personnel
    `);
    
    const totalResult = await pool.request().query(`
      SELECT COUNT(*) as total
      FROM Personnel
      WHERE statut = 'Actif'
    `);
    
    // Construire la réponse
    const orgData = {
      direction: directionResult.recordset[0] || null,
      responsables: responsablesResult.recordset || [],
      biologistes: {
        parSpecialite: biologistesParSpecialite,
        total: biologistesResult.recordset.length
      },
      techniciens: {
        parDepartement: techniciensParDepartement,
        gardeNuit: gardeNuit,
        total: techniciensResult.recordset.length
      },
      support: {
        secretaires: secretaires,
        preleveurs: preleveurs,
        agents: agents,
        total: supportResult.recordset.length
      },
      statistiques: {
        parType: statsResult.recordset,
        total: totalResult.recordset[0].total
      }
    };
    
    console.log('Données organigramme générées:', {
      direction: !!orgData.direction,
      responsables: orgData.responsables.length,
      biologistes: Object.keys(biologistesParSpecialite).length,
      techniciens: Object.keys(techniciensParDepartement).length,
      support: orgData.support.total,
      total: orgData.statistiques.total
    });
    
    res.json(orgData);
    
  } catch (err) {
    console.error('Erreur API organigramme:', err);
    res.status(500).json({ 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// API pour récupérer le détail d'un nœud (liste du personnel)
router.get('/api/node/:type/:category', async (req, res) => {
  try {
    const { type, category } = req.params;
    const pool = await getConnection();
    
    let query = '';
    
    if (type === 'biologiste') {
      query = `
        SELECT 
          p.id,
          p.matricule,
          CONCAT(p.prenom, ' ', p.nom) as nom_complet,
          p.email,
          p.telephone,
          b.specialite
        FROM Personnel p
        INNER JOIN Biologistes b ON p.id = b.personnel_id
        WHERE p.statut = 'Actif'
          AND b.specialite = @category
        ORDER BY p.nom
      `;
    } else if (type === 'technicien') {
      if (category === 'Garde de Nuit') {
        query = `
          SELECT 
            p.id,
            p.matricule,
            CONCAT(p.prenom, ' ', p.nom) as nom_complet,
            p.email,
            p.telephone,
            t.departement
          FROM Personnel p
          INNER JOIN Techniciens t ON p.id = t.personnel_id
          WHERE p.statut = 'Actif'
            AND t.poste_nuit = 1
          ORDER BY p.nom
        `;
      } else {
        query = `
          SELECT 
            p.id,
            p.matricule,
            CONCAT(p.prenom, ' ', p.nom) as nom_complet,
            p.email,
            p.telephone,
            t.departement
          FROM Personnel p
          INNER JOIN Techniciens t ON p.id = t.personnel_id
          WHERE p.statut = 'Actif'
            AND t.departement = @category
          ORDER BY p.nom
        `;
      }
    } else if (type === 'support') {
      query = `
        SELECT 
          p.id,
          p.matricule,
          CONCAT(p.prenom, ' ', p.nom) as nom_complet,
          p.email,
          p.telephone,
          p.type_personnel
        FROM Personnel p
        WHERE p.statut = 'Actif'
          AND p.type_personnel = @category
        ORDER BY p.nom
      `;
    }
    
    const request = pool.request();
    if (category !== 'Garde de Nuit') {
      request.input('category', sql.VarChar, category);
    }
    
    const result = await request.query(query);
    res.json(result.recordset);
    
  } catch (err) {
    console.error('Erreur API node:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;