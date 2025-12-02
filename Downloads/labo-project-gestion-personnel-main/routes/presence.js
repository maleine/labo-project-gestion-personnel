// ==================== routes/presence.js (CORRIGÉ AVEC currentPage) ====================
const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../database/config');

// Middleware d'authentification
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

router.use(requireAuth);

// ========== DASHBOARD ==========
router.get('/dashboard', async (req, res) => {
  try {
    const pool = await getConnection();
    
    // Stats du jour
    const statsResult = await pool.request().query(`
      SELECT 
        COUNT(DISTINCT p.id) as totalEmployes,
        COUNT(DISTINCT CASE WHEN pj.statut = 'Présent' THEN pj.personnel_id END) as presentsAujourdhui,
        COUNT(DISTINCT CASE WHEN pj.statut = 'Absent' OR pj.personnel_id IS NULL THEN p.id END) as absents,
        COUNT(CASE WHEN pj.retard_minutes > 0 THEN 1 END) as retardsAujourdhui,
        COUNT(CASE WHEN MONTH(pj.date) = MONTH(GETDATE()) AND pj.retard_minutes > 0 THEN 1 END) as retardsMois,
        CAST(
          CASE 
            WHEN COUNT(DISTINCT p.id) > 0 
            THEN (COUNT(DISTINCT CASE WHEN pj.statut = 'Présent' THEN pj.personnel_id END) * 100.0 / COUNT(DISTINCT p.id))
            ELSE 0 
          END AS DECIMAL(5,1)
        ) as tauxPresence
      FROM Personnel p
      LEFT JOIN PresencesJournalieres pj ON p.id = pj.personnel_id 
        AND CAST(pj.date AS DATE) = CAST(GETDATE() AS DATE)
      WHERE p.statut = 'Actif'
    `);
    
    const stats = statsResult.recordset[0];
    
    // Alertes
    const alertesResult = await pool.request().query(`
      SELECT 
        'warning' as type,
        'Retards répétés' as titre,
        'Employés avec plus de 3 retards ce mois' as message,
        COUNT(DISTINCT personnel_id) as count
      FROM PresencesJournalieres
      WHERE MONTH(date) = MONTH(GETDATE())
        AND YEAR(date) = YEAR(GETDATE())
        AND retard_minutes > 0
      GROUP BY personnel_id
      HAVING COUNT(*) >= 3
      
      UNION ALL
      
      SELECT 
        'danger' as type,
        'Absences non justifiées' as titre,
        'Absences sans justificatif' as message,
        COUNT(*) as count
      FROM AnomaliesPresence
      WHERE type_anomalie = 'Absence non justifiée'
        AND traitee = 0
        AND date >= DATEADD(day, -7, GETDATE())
    `);
    
    const alertes = alertesResult.recordset.filter(a => a.count > 0);
    
    // Données graphique (7 derniers jours)
    const chartResult = await pool.request().query(`
      SELECT 
        CONVERT(varchar, date, 23) as date,
        FORMAT(date, 'dd/MM') as label,
        COUNT(CASE WHEN statut = 'Présent' THEN 1 END) as presents,
        COUNT(CASE WHEN statut = 'Absent' THEN 1 END) as absents
      FROM PresencesJournalieres
      WHERE date >= DATEADD(day, -7, GETDATE())
      GROUP BY date
      ORDER BY date
    `);
    
    const chartData = {
      labels: chartResult.recordset.map(r => r.label),
      presents: chartResult.recordset.map(r => r.presents),
      absents: chartResult.recordset.map(r => r.absents)
    };
    
    // Derniers pointages - CORRIGÉ: utilise PointagesBruts
    const pointagesResult = await pool.request().query(`
      SELECT TOP 10
        CONCAT(p.prenom, ' ', p.nom) as nom,
        FORMAT(pb.date_heure, 'HH:mm') as heure,
        pb.type_pointage as type
      FROM PointagesBruts pb
      INNER JOIN Personnel p ON pb.personnel_id = p.id
      WHERE CAST(pb.date_heure AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY pb.date_heure DESC
    `);
    
    const derniersPointages = pointagesResult.recordset;
    
    // Anomalies récentes
    const anomaliesResult = await pool.request().query(`
      SELECT TOP 5
        CONCAT(p.prenom, ' ', p.nom) as nom,
        FORMAT(a.date, 'dd/MM/yyyy') as date,
        a.type_anomalie as type
      FROM AnomaliesPresence a
      INNER JOIN Personnel p ON a.personnel_id = p.id
      WHERE a.traitee = 0
      ORDER BY a.date DESC, a.severite DESC
    `);
    
    const anomaliesRecentes = anomaliesResult.recordset;
    
    res.render('presence/dashboard', { 
      title: 'Tableau de bord',
      currentPage: 'presence-dashboard',  // ✅ AJOUTÉ
      stats,
      alertes,
      chartData,
      derniersPointages,
      anomaliesRecentes
    });
  } catch (err) {
    console.error('Erreur dashboard:', err);
    res.status(500).render('error', { 
      title: 'Erreur',
      message: 'Erreur lors du chargement du tableau de bord',
      error: err
    });
  }
});

// ========== PRÉSENCES AUJOURD'HUI ==========
router.get('/aujourd-hui', async (req, res) => {
  try {
    const pool = await getConnection();
    
    // Stats
    const statsResult = await pool.request().query(`
      SELECT 
        COUNT(DISTINCT p.id) as total,
        COUNT(DISTINCT CASE WHEN pj.statut = 'Présent' THEN pj.personnel_id END) as presents,
        COUNT(DISTINCT CASE WHEN pj.statut = 'Absent' OR pj.personnel_id IS NULL THEN p.id END) as absents,
        COUNT(CASE WHEN pj.retard_minutes > 0 THEN 1 END) as retards,
        0 as conges
      FROM Personnel p
      LEFT JOIN PresencesJournalieres pj ON p.id = pj.personnel_id 
        AND CAST(pj.date AS DATE) = CAST(GETDATE() AS DATE)
      WHERE p.statut = 'Actif'
    `);
    
    // Liste employés avec leurs pointages - CORRIGÉ
    const employesResult = await pool.request().query(`
      SELECT 
        p.id,
        CONCAT(p.prenom, ' ', p.nom) as nom,
        p.matricule,
        COALESCE(
          (SELECT TOP 1 d.nom 
           FROM AffectationsPostes ap 
           INNER JOIN Postes po ON ap.poste_id = po.id 
           INNER JOIN Departements d ON po.departement_id = d.id
           WHERE ap.personnel_id = p.id AND ap.statut = 'En cours'
          ), 
          'Non assigné'
        ) as departement,
        FORMAT(entree.date_heure, 'HH:mm') as heureArrivee,
        FORMAT(sortie.date_heure, 'HH:mm') as heureDepart,
        CASE 
          WHEN pj.statut = 'Présent' THEN 'present'
          WHEN pj.retard_minutes > 0 THEN 'retard'
          ELSE 'absent'
        END as statut,
        pj.retard_minutes as retardMinutes
      FROM Personnel p
      LEFT JOIN PresencesJournalieres pj ON p.id = pj.personnel_id 
        AND CAST(pj.date AS DATE) = CAST(GETDATE() AS DATE)
      LEFT JOIN (
        SELECT personnel_id, MIN(date_heure) as date_heure
        FROM PointagesBruts
        WHERE CAST(date_heure AS DATE) = CAST(GETDATE() AS DATE)
          AND type_pointage IN ('CheckIn', 'Entrée')
        GROUP BY personnel_id
      ) entree ON p.id = entree.personnel_id
      LEFT JOIN (
        SELECT personnel_id, MAX(date_heure) as date_heure
        FROM PointagesBruts
        WHERE CAST(date_heure AS DATE) = CAST(GETDATE() AS DATE)
          AND type_pointage IN ('CheckOut', 'Sortie')
        GROUP BY personnel_id
      ) sortie ON p.id = sortie.personnel_id
      WHERE p.statut = 'Actif'
      ORDER BY nom
    `);
    
    res.render('presence/aujourd-hui', {
      title: 'Présences du jour',
      currentPage: 'presence-aujourd-hui',  // ✅ AJOUTÉ
      stats: statsResult.recordset[0],
      employes: employesResult.recordset
    });
  } catch (err) {
    console.error('Erreur aujourd\'hui:', err);
    res.status(500).render('error', { 
      title: 'Erreur',
      message: 'Erreur lors du chargement des présences',
      error: err
    });
  }
});

// ========== HISTORIQUE ==========
router.get('/historique', async (req, res) => {
  try {
    const filters = {
      dateDebut: req.query.dateDebut || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0],
      dateFin: req.query.dateFin || new Date().toISOString().split('T')[0],
      employe: req.query.employe || null,
      statut: req.query.statut || null
    };
    
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    
    const pool = await getConnection();
    
    // Construire la requête avec filtres
    let whereClause = 'WHERE pj.date >= @dateDebut AND pj.date <= @dateFin';
    if (filters.employe) whereClause += ' AND p.id = @employeId';
    if (filters.statut) whereClause += ' AND pj.statut = @statut';
    
    // Compter le total
    const countResult = await pool.request()
      .input('dateDebut', sql.Date, filters.dateDebut)
      .input('dateFin', sql.Date, filters.dateFin)
      .input('employeId', sql.Int, filters.employe)
      .input('statut', sql.VarChar, filters.statut)
      .query(`
        SELECT COUNT(*) as total
        FROM PresencesJournalieres pj
        INNER JOIN Personnel p ON pj.personnel_id = p.id
        ${whereClause}
      `);
    
    const total = countResult.recordset[0].total;
    
    // Récupérer les données - CORRIGÉ
    const historiqueResult = await pool.request()
      .input('dateDebut', sql.Date, filters.dateDebut)
      .input('dateFin', sql.Date, filters.dateFin)
      .input('employeId', sql.Int, filters.employe)
      .input('statut', sql.VarChar, filters.statut)
      .input('limit', sql.Int, limit)
      .input('offset', sql.Int, offset)
      .query(`
        SELECT 
          pj.id,
          pj.date,
          FORMAT(pj.heure_arrivee, 'HH:mm') as heureArrivee,
          FORMAT(pj.heure_depart, 'HH:mm') as heureDepart,
          CASE 
            WHEN pj.temps_travail_minutes >= 60 
            THEN CONCAT(pj.temps_travail_minutes / 60, 'h', pj.temps_travail_minutes % 60, 'm')
            ELSE CONCAT(pj.temps_travail_minutes, 'm')
          END as dureeTravail,
          pj.statut,
          pj.retard_minutes as retardMinutes,
          p.id as [employe.id],
          CONCAT(p.prenom, ' ', p.nom) as [employe.nom],
          p.matricule as [employe.matricule],
          COALESCE(
            (SELECT TOP 1 d.nom 
             FROM AffectationsPostes ap 
             INNER JOIN Postes po ON ap.poste_id = po.id 
             INNER JOIN Departements d ON po.departement_id = d.id
             WHERE ap.personnel_id = p.id AND ap.statut = 'En cours'
            ), 
            'Non assigné'
          ) as [employe.departement]
        FROM PresencesJournalieres pj
        INNER JOIN Personnel p ON pj.personnel_id = p.id
        ${whereClause}
        ORDER BY pj.date DESC, [employe.nom]
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);
    
    // Liste des employés pour le filtre
    const employesResult = await pool.request().query(`
      SELECT id, CONCAT(prenom, ' ', nom) as nom
      FROM Personnel
      WHERE statut = 'Actif'
      ORDER BY nom
    `);
    
    // Transformer les résultats
    const historique = historiqueResult.recordset.map(row => ({
      id: row.id,
      date: row.date,
      heureArrivee: row.heureArrivee,
      heureDepart: row.heureDepart,
      dureeTravail: row.dureeTravail,
      statut: row.statut,
      retardMinutes: row.retardMinutes,
      employe: {
        id: row['employe.id'],
        nom: row['employe.nom'],
        matricule: row['employe.matricule'],
        departement: row['employe.departement']
      }
    }));
    
    res.render('presence/historique', {
      title: 'Historique des présences',
      currentPage: 'presence-historique',  // ✅ AJOUTÉ
      historique,
      filters,
      employes: employesResult.recordset,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total
      }
    });
  } catch (err) {
    console.error('Erreur historique:', err);
    res.status(500).render('error', { 
      title: 'Erreur',
      message: 'Erreur lors du chargement de l\'historique',
      error: err
    });
  }
});

// ========== ANOMALIES ==========
router.get('/anomalies', async (req, res) => {
  try {
    const filters = {
      periode: req.query.periode || 'month',
      gravite: req.query.gravite || '',
      type: req.query.type || '',
      statut: req.query.statut || 'en_attente'
    };
    
    // Calculer les dates selon la période
    let dateDebut, dateFin = new Date();
    switch(filters.periode) {
      case 'today':
        dateDebut = new Date();
        break;
      case 'week':
        dateDebut = new Date(Date.now() - 7*24*60*60*1000);
        break;
      case 'month':
        dateDebut = new Date(Date.now() - 30*24*60*60*1000);
        break;
      default:
        dateDebut = new Date(Date.now() - 90*24*60*60*1000);
    }
    
    const pool = await getConnection();
    
    // Stats
    const statsResult = await pool.request().query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN severite = 'Critique' THEN 1 END) as critiques,
        COUNT(CASE WHEN severite = 'Majeure' THEN 1 END) as majeures,
        COUNT(CASE WHEN severite = 'Mineure' THEN 1 END) as mineures,
        COUNT(CASE WHEN traitee = 1 AND MONTH(date_traitement) = MONTH(GETDATE()) THEN 1 END) as resolues
      FROM AnomaliesPresence
      WHERE traitee = 0
    `);
    
    // Construire la requête avec filtres
    let whereClause = 'WHERE a.date >= @dateDebut AND a.date <= @dateFin';
    if (filters.gravite) whereClause += ' AND a.severite = @gravite';
    if (filters.type) whereClause += ' AND a.type_anomalie LIKE @type';
    if (filters.statut === 'en_attente') whereClause += ' AND a.traitee = 0';
    else if (filters.statut === 'resolue') whereClause += ' AND a.traitee = 1';
    
    // Récupérer les anomalies - CORRIGÉ
    const anomaliesResult = await pool.request()
      .input('dateDebut', sql.Date, dateDebut.toISOString().split('T')[0])
      .input('dateFin', sql.Date, dateFin.toISOString().split('T')[0])
      .input('gravite', sql.VarChar, filters.gravite)
      .input('type', sql.VarChar, `%${filters.type}%`)
      .query(`
        SELECT 
          a.id,
          a.date,
          a.type_anomalie as type,
          a.severite as gravite,
          a.description,
          COALESCE(a.resolution, '') as details,
          CASE 
            WHEN a.traitee = 1 THEN 'resolue'
            ELSE 'en_attente'
          END as statut,
          p.id as [employe.id],
          CONCAT(p.prenom, ' ', p.nom) as [employe.nom],
          p.matricule as [employe.matricule],
          COALESCE(
            (SELECT TOP 1 d.nom 
             FROM AffectationsPostes ap 
             INNER JOIN Postes po ON ap.poste_id = po.id 
             INNER JOIN Departements d ON po.departement_id = d.id
             WHERE ap.personnel_id = p.id AND ap.statut = 'En cours'
            ), 
            'Non assigné'
          ) as [employe.departement]
        FROM AnomaliesPresence a
        INNER JOIN Personnel p ON a.personnel_id = p.id
        ${whereClause}
        ORDER BY a.date DESC, a.severite DESC
      `);
    
    // Transformer en objets imbriqués
    const anomalies = anomaliesResult.recordset.map(row => ({
      id: row.id,
      date: row.date,
      type: row.type,
      gravite: row.gravite.toLowerCase(),
      description: row.description,
      details: row.details,
      statut: row.statut,
      employe: {
        id: row['employe.id'],
        nom: row['employe.nom'],
        matricule: row['employe.matricule'],
        departement: row['employe.departement']
      },
      historique: []
    }));
    
    res.render('presence/anomalies', {
      title: 'Anomalies de présence',
      currentPage: 'presence-anomalies',  // ✅ AJOUTÉ
      stats: statsResult.recordset[0],
      filters,
      anomalies
    });
  } catch (err) {
    console.error('Erreur anomalies:', err);
    res.status(500).render('error', { 
      title: 'Erreur',
      message: 'Erreur lors du chargement des anomalies',
      error: err
    });
  }
});

// ========== MAPPING ==========
router.get('/mapping', async (req, res) => {
  try {
    const pool = await getConnection();
    
    // Stats
    const statsResult = await pool.request().query(`
      SELECT 
        COUNT(DISTINCT p.id) as totalEmployes,
        COUNT(DISTINCT m.personnel_id) as mappes,
        COUNT(DISTINCT CASE WHEN m.personnel_id IS NULL THEN p.id END) as nonMappes,
        (SELECT COUNT(*) FROM vw_UtilisateursZKTeco) as usersZK
      FROM Personnel p
      LEFT JOIN MappingPointeuse m ON p.id = m.personnel_id AND m.actif = 1
      WHERE p.statut = 'Actif'
    `);
    
    // Info appareil
    const deviceResult = await pool.request().query(`
      SELECT TOP 1
        modele as model,
        adresse_ip as ip,
        derniere_synchro as lastSync
      FROM AppareilsPointage
      WHERE statut = 'Actif'
    `);
    
    // Liste employés avec mapping
    const employesResult = await pool.request().query(`
      SELECT 
        p.id,
        CONCAT(p.prenom, ' ', p.nom) as nom,
        p.matricule,
        COALESCE(
          (SELECT TOP 1 d.nom 
           FROM AffectationsPostes ap 
           INNER JOIN Postes po ON ap.poste_id = po.id 
           INNER JOIN Departements d ON po.departement_id = d.id
           WHERE ap.personnel_id = p.id AND ap.statut = 'En cours'
          ), 
          'Non assigné'
        ) as departement,
        m.user_id_pointeuse as zkUserId,
        zk.name as zkUserName,
        (SELECT TOP 1 date_heure FROM PointagesBruts WHERE personnel_id = p.id ORDER BY date_heure DESC) as lastPointage
      FROM Personnel p
      LEFT JOIN MappingPointeuse m ON p.id = m.personnel_id AND m.actif = 1
      LEFT JOIN vw_UtilisateursZKTeco zk ON m.user_id_pointeuse = zk.user_id
      WHERE p.statut = 'Actif'
      ORDER BY nom
    `);
    
    // Utilisateurs ZK disponibles
    const zkUsersResult = await pool.request().query(`
      SELECT user_id as userId, name, card_no as cardNo
      FROM vw_UtilisateursZKTeco
      ORDER BY user_id
    `);
    
    res.render('presence/mapping', {
      title: 'Mapping pointeuse',
      currentPage: 'presence-mapping',  // ✅ AJOUTÉ
      stats: statsResult.recordset[0],
      device: deviceResult.recordset[0] || {},
      employes: employesResult.recordset,
      zkUsers: zkUsersResult.recordset
    });
  } catch (err) {
    console.error('Erreur mapping:', err);
    res.status(500).render('error', { 
      title: 'Erreur',
      message: 'Erreur lors du chargement du mapping',
      error: err
    });
  }
});

// ========== SYNCHRONISATION ==========
router.get('/synchronisation', async (req, res) => {
  try {
    const pool = await getConnection();
    
    const appareils = await pool.request().query(`
      SELECT * FROM AppareilsPointage 
      WHERE statut = 'Actif'
      ORDER BY nom
    `);
    
    const logs = await pool.request().query(`
      SELECT TOP 20 * FROM LogsSynchroPointeuse 
      ORDER BY date_synchro DESC
    `);
    
    res.render('presence/synchronisation', { 
      title: 'Synchronisation',
      currentPage: 'presence-synchronisation',  // ✅ AJOUTÉ
      appareils: appareils.recordset,
      logs: logs.recordset
    });
  } catch (err) {
    console.error('Erreur synchronisation:', err);
    res.status(500).render('error', { 
      title: 'Erreur',
      message: 'Erreur lors du chargement de la synchronisation',
      error: err
    });
  }
});

// ========== API ROUTES ==========

// Synchroniser un appareil
router.post('/synchronisation/lancer/:appareilId', async (req, res) => {
  try {
    const pool = await getConnection();
    const appareil = await pool.request()
      .input('id', sql.Int, req.params.appareilId)
      .query('SELECT * FROM AppareilsPointage WHERE id = @id');
    
    if (appareil.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Appareil non trouvé' });
    }
    
    // TODO: Implémenter la synchronisation ZKTeco
    res.json({ success: true, message: 'Synchronisation démarrée' });
  } catch (err) {
    console.error('Erreur sync:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Détecter anomalies
router.post('/api/anomalies/detect', async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().execute('sp_DetecterAnomalies');
    
    res.json({ 
      success: true, 
      count: result.recordset[0]?.anomalies_detectees || 0 
    });
  } catch (err) {
    console.error('Erreur détection:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Résoudre anomalie
router.post('/api/anomalies/resolve', async (req, res) => {
  try {
    const { anomalieId, action, commentaire, notifier } = req.body;
    
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, anomalieId)
      .input('traite_par', sql.Int, req.session.userId)
      .input('resolution', sql.Text, `${action}: ${commentaire}`)
      .query(`
        UPDATE AnomaliesPresence
        SET traitee = 1,
            date_traitement = GETDATE(),
            traite_par = @traite_par,
            resolution = @resolution
        WHERE id = @id
      `);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Erreur résolution:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Ignorer anomalie
router.post('/api/anomalies/:id/ignore', async (req, res) => {
  try {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('traite_par', sql.Int, req.session.userId)
      .query(`
        UPDATE AnomaliesPresence
        SET traitee = 1,
            date_traitement = GETDATE(),
            traite_par = @traite_par,
            resolution = 'Ignorée par l''utilisateur'
        WHERE id = @id
      `);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Créer/modifier mapping
router.post('/api/mapping', async (req, res) => {
  try {
    const { employeId, zkUserId, verifyMode, notes } = req.body;
    
    const pool = await getConnection();
    
    // Vérifier si le mapping existe
    const existing = await pool.request()
      .input('personnel_id', sql.Int, employeId)
      .query('SELECT id FROM MappingPointeuse WHERE personnel_id = @personnel_id');
    
    if (existing.recordset.length > 0) {
      // Update
      await pool.request()
        .input('personnel_id', sql.Int, employeId)
        .input('user_id', sql.VarChar, zkUserId)
        .input('notes', sql.Text, notes)
        .query(`
          UPDATE MappingPointeuse
          SET user_id_pointeuse = @user_id,
              notes = @notes,
              date_enregistrement = GETDATE()
          WHERE personnel_id = @personnel_id
        `);
    } else {
      // Insert
      await pool.request()
        .input('personnel_id', sql.Int, employeId)
        .input('user_id', sql.VarChar, zkUserId)
        .input('notes', sql.Text, notes)
        .query(`
          INSERT INTO MappingPointeuse (personnel_id, user_id_pointeuse, notes, actif)
          VALUES (@personnel_id, @user_id, @notes, 1)
        `);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Erreur mapping:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Supprimer mapping
router.delete('/api/mapping/:employeId', async (req, res) => {
  try {
    const pool = await getConnection();
    await pool.request()
      .input('personnel_id', sql.Int, req.params.employeId)
      .query('DELETE FROM MappingPointeuse WHERE personnel_id = @personnel_id');
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;