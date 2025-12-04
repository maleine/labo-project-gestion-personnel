// ==================== routes/rh.js ====================
const express = require('express');
const router = express.Router();
const Departement = require('../models/Departement');
const Poste = require('../models/Poste');
const Formation = require('../models/Formation');
const Habilitation = require('../models/Habilitation');
const Evaluation = require('../models/Evaluation');
const { getConnection, sql } = require('../database/config');
const Competence = require('../models/Competence');
const Personnel = require('../models/Personnel');
const Recrutement = require('../models/Recrutement');

// ============ RECRUTEMENTS ============

// Liste des recrutements
router.get('/recrutements', async (req, res) => {
  try {
    const recrutements = await Recrutement.getAll();
    const statistiques = await Recrutement.getStatistiques();
    const enCours = await Recrutement.getEnCours();

    res.render('rh/recrutements/list', {
      recrutements,
      statistiques,
      enCours,
      currentPage: 'recrutements'
    });
  } catch (err) {
    console.error('Erreur liste recrutements:', err);
    res.status(500).render('error', {
      title: 'Erreur',
      message: 'Impossible de charger les recrutements',
      error: err,
      currentPage: 'recrutements'
    });
  }
});

// Formulaire nouveau recrutement
router.get('/recrutements/nouveau', async (req, res) => {
  try {
    const postes = await Poste.getAll();
    
    res.render('rh/recrutements/form', {
      recrutement: null,
      postes,
      currentPage: 'recrutements'
    });
  } catch (err) {
    console.error('Erreur form recrutement:', err);
    res.redirect('/rh/recrutements');
  }
});

// Créer un recrutement
router.post('/recrutements/nouveau', async (req, res) => {
  try {
    const data = {
      ...req.body,
      demandeur_id: req.session.personnelId
    };
    
    await Recrutement.create(data);
    res.redirect('/rh/recrutements?success=Recrutement créé avec succès');
  } catch (err) {
    console.error('Erreur création recrutement:', err);
    res.redirect('/rh/recrutements?error=Erreur lors de la création');
  }
});

// Détails d'un recrutement
router.get('/recrutements/:id', async (req, res) => {
  try {
    const recrutement = await Recrutement.getById(req.params.id);
    const competences = await Competence.getByPoste(recrutement.poste_id);

    res.render('rh/recrutements/details', {
      recrutement,
      competences,
      currentPage: 'recrutements'
    });
  } catch (err) {
    console.error('Erreur détails recrutement:', err);
    res.redirect('/rh/recrutements');
  }
});

// Formulaire édition recrutement
router.get('/recrutements/:id/edit', async (req, res) => {
  try {
    const recrutement = await Recrutement.getById(req.params.id);
    const postes = await Poste.getAll();
    
    res.render('rh/recrutements/form', {
      recrutement,
      postes,
      currentPage: 'recrutements'
    });
  } catch (err) {
    console.error('Erreur édition recrutement:', err);
    res.redirect('/rh/recrutements');
  }
});


// ==================== À AJOUTER/REMPLACER dans routes/rh.js ====================
// Remplacer la route existante router.get('/postes/api/:id', ...) par celle-ci
// ==================== À AJOUTER dans routes/rh.js ====================
// PLACER cette route AVANT les autres routes de postes (avant '/postes')

// API: Liste des postes disponibles (avec places vacantes)
router.get('/postes/api/disponibles', async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        p.id, 
        p.code, 
        p.titre, 
        p.departement_id, 
        p.niveau,
        p.nb_postes_disponibles,
        d.nom as departement_nom,
        COUNT(ap.id) as postes_occupes,
        (p.nb_postes_disponibles - COUNT(ap.id)) as postes_vacants
      FROM Postes p
      LEFT JOIN Departements d ON p.departement_id = d.id
      LEFT JOIN AffectationsPostes ap ON p.id = ap.poste_id AND ap.statut = 'En cours'
      WHERE p.statut = 'Actif'
      GROUP BY 
        p.id, p.code, p.titre, p.departement_id, p.niveau, 
        p.nb_postes_disponibles, d.nom
      HAVING (p.nb_postes_disponibles - COUNT(ap.id)) > 0
      ORDER BY d.nom, p.titre
    `);
    
    res.json({
      success: true,
      postes: result.recordset
    });
  } catch (err) {
    console.error('Erreur API postes disponibles:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});
// API: Détails d'un poste avec personnel et compétences (CORRIGÉ)
router.get('/postes/api/:id', async (req, res) => {
  try {
    const posteId = req.params.id;
    
    // Récupérer les infos du poste
    const poste = await Poste.getById(posteId);
    
    if (!poste) {
      return res.status(404).json({
        success: false,
        message: 'Poste non trouvé'
      });
    }

    // Récupérer le personnel affecté au poste
    const pool = await getConnection();
    const personnelResult = await pool.request()
      .input('posteId', sql.Int, posteId)
      .query(`
        SELECT 
          p.id, p.matricule, p.nom, p.prenom, p.type_personnel,
          ap.date_debut, ap.date_fin, ap.statut as statut_affectation
        FROM Personnel p
        INNER JOIN AffectationsPostes ap ON p.id = ap.personnel_id
        WHERE ap.poste_id = @posteId 
        AND ap.statut = 'En cours'
        ORDER BY ap.date_debut DESC
      `);

    // Récupérer les compétences requises pour le poste (SANS la colonne obligatoire)
    const competencesResult = await pool.request()
      .input('posteId', sql.Int, posteId)
      .query(`
        SELECT 
          c.id, c.nom, c.categorie,
          cp.niveau_requis
        FROM Competences c
        INNER JOIN CompetencesPostes cp ON c.id = cp.competence_id
        WHERE cp.poste_id = @posteId
        ORDER BY c.nom
      `);

    res.json({
      success: true,
      poste: poste,
      personnel: personnelResult.recordset,
      competences: competencesResult.recordset
    });
  } catch (err) {
    console.error('Erreur API poste:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});
// Mettre à jour un recrutement
router.post('/recrutements/:id/edit', async (req, res) => {
  try {
    await Recrutement.update(req.params.id, req.body);
    res.redirect('/rh/recrutements?success=Recrutement modifié avec succès');
  } catch (err) {
    console.error('Erreur modification recrutement:', err);
    res.redirect('/rh/recrutements?error=Erreur lors de la modification');
  }
});

// Changer le statut d'un recrutement
router.post('/recrutements/:id/statut', async (req, res) => {
  try {
    const { statut } = req.body;
    const valideurId = (statut === 'Validé') ? req.session.personnelId : null;
    
    await Recrutement.changerStatut(req.params.id, statut, valideurId);
    res.json({ success: true, message: 'Statut modifié' });
  } catch (err) {
    console.error('Erreur changement statut:', err);
    res.status(500).json({ success: false, message: 'Erreur lors du changement de statut' });
  }
});

// Supprimer un recrutement
router.post('/recrutements/:id/delete', async (req, res) => {
  try {
    await Recrutement.delete(req.params.id);
    res.json({ success: true, message: 'Recrutement supprimé' });
  } catch (err) {
    console.error('Erreur suppression recrutement:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
  }
});

// Rapport recrutements par année
router.get('/recrutements/rapport/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const recrutements = await Recrutement.getByYear(year);
    
    res.render('rh/recrutements/rapport', {
      recrutements,
      year,
      currentPage: 'recrutements'
    });
  } catch (err) {
    console.error('Erreur rapport recrutements:', err);
    res.redirect('/rh/recrutements');
  }
});

// ========== DÉPARTEMENTS ==========

// Liste des départements
router.get('/departements', async (req, res) => {
  try {
    const departements = await Departement.getAll();
    res.render('rh/departements-list', { 
      departements,
      currentPage: 'departements'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire ajout département
router.get('/departements/add', async (req, res) => {
  try {
    const pool = await getConnection();
    const responsables = await pool.request().query(
      'SELECT id, prenom, nom FROM Personnel WHERE type_personnel IN (\'Biologiste\', \'Cadre\') AND statut = \'Actif\' ORDER BY nom'
    );
    res.render('rh/departements-form', { 
      departement: null, 
      responsables: responsables.recordset,
      currentPage: 'departements'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Créer département
router.post('/departements/create', async (req, res) => {
  try {
    await Departement.create(req.body);
    res.redirect('/rh/departements');
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Éditer département
router.get('/departements/edit/:id', async (req, res) => {
  try {
    const departement = await Departement.getById(req.params.id);
    const pool = await getConnection();
    const responsables = await pool.request().query(
      'SELECT id, prenom, nom FROM Personnel WHERE type_personnel IN (\'Biologiste\', \'Cadre\') AND statut = \'Actif\' ORDER BY nom'
    );
    res.render('rh/departements-form', { 
      departement, 
      responsables: responsables.recordset,
      currentPage: 'departements'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// API: Détails d'un département avec son personnel
router.get('/departements/api/:id', async (req, res) => {
  try {
    const deptId = req.params.id;
    
    // Récupérer les infos du département
    const departement = await Departement.getById(deptId);
    
    if (!departement) {
      return res.status(404).json({
        success: false,
        message: 'Département non trouvé'
      });
    }

    // Récupérer le personnel du département
    const personnel = await Personnel.getByDepartment(deptId);

    res.json({
      success: true,
      departement: departement,
      personnel: personnel
    });
  } catch (err) {
    console.error('Erreur API département:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Mettre à jour département
router.post('/departements/update/:id', async (req, res) => {
  try {
    await Departement.update(req.params.id, req.body);
    res.redirect('/rh/departements');
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// ========== POSTES / FONCTIONS ==========

// Liste des postes
router.get('/postes', async (req, res) => {
  try {
    const postes = await Poste.getAll();
    res.render('rh/postes-list', { 
      postes,
      currentPage: 'postes'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire ajout poste
router.get('/postes/add', async (req, res) => {
  try {
    const departements = await Departement.getAll();
    res.render('rh/postes-form', { 
      poste: null, 
      departements,
      currentPage: 'postes'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Créer poste
router.post('/postes/create', async (req, res) => {
  try {
    await Poste.create(req.body);
    res.redirect('/rh/postes');
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Éditer poste
router.get('/postes/edit/:id', async (req, res) => {
  try {
    const poste = await Poste.getById(req.params.id);
    const departements = await Departement.getAll();
    res.render('rh/postes-form', { 
      poste, 
      departements,
      currentPage: 'postes'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Mettre à jour poste
router.post('/postes/update/:id', async (req, res) => {
  try {
    await Poste.update(req.params.id, req.body);
    res.redirect('/rh/postes');
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Affecter personnel à un poste
router.post('/postes/affecter', async (req, res) => {
  try {
    await Poste.affecterPersonnel(req.body.poste_id, req.body.personnel_id, req.body.date_debut);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== FORMATIONS ==========

// Liste des formations
router.get('/formations', async (req, res) => {
  try {
    const formations = await Formation.getAll();
    res.render('rh/formations-list', { 
      formations,
      currentPage: 'formations'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire ajout formation
router.get('/formations/add', (req, res) => {
  res.render('rh/formations-form', { 
    formation: null,
    currentPage: 'formations'
  });
});

// Créer formation
router.post('/formations/create', async (req, res) => {
  try {
    await Formation.create(req.body);
    res.redirect('/rh/formations');
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Détails formation avec participants
router.get('/formations/:id', async (req, res) => {
  try {
    const formation = await Formation.getById(req.params.id);
    const participants = await Formation.getParticipants(req.params.id);
    const pool = await getConnection();
    const personnel = await pool.request().query(
      'SELECT id, prenom, nom, type_personnel FROM Personnel WHERE statut = \'Actif\' ORDER BY nom'
    );
    res.render('rh/formations-details', { 
      formation, 
      participants, 
      personnel: personnel.recordset,
      currentPage: 'formations'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Inscrire personnel à une formation
router.post('/formations/:id/inscrire', async (req, res) => {
  try {
    await Formation.inscrirePersonnel(req.params.id, req.body.personnel_id);
    res.redirect('/rh/formations/' + req.params.id);
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});


// ==================== À VÉRIFIER/AJOUTER dans routes/rh.js ====================
// Section HABILITATIONS - Routes corrigées

// Liste des habilitations
router.get('/habilitations', async (req, res) => {
  try {
    const habilitations = await Habilitation.getAll();
    const aRenouveler = await Habilitation.getARenouveler(90);
    
    res.render('rh/habilitations-list', { 
      habilitations,
      aRenouveler,
      currentPage: 'habilitations'
    });
  } catch (err) {
    console.error('Erreur liste habilitations:', err);
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire ajout habilitation
router.get('/habilitations/add', async (req, res) => {
  try {
    const pool = await getConnection();
    const personnel = await pool.request().query(
      'SELECT id, prenom, nom, type_personnel FROM Personnel WHERE statut = \'Actif\' ORDER BY nom'
    );
    const formations = await pool.request().query(
      'SELECT id, titre FROM Formations WHERE statut = \'Terminée\' ORDER BY date_fin DESC'
    );
    
    res.render('rh/habilitations-form', { 
      habilitation: null, 
      personnel: personnel.recordset,
      formations: formations.recordset,
      currentPage: 'habilitations'
    });
  } catch (err) {
    console.error('Erreur formulaire habilitation:', err);
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Créer habilitation (CORRIGÉ)
router.post('/habilitations/create', async (req, res) => {
  try {
    console.log('Données du formulaire habilitation:', req.body);
    
    // Validation des champs requis
    if (!req.body.personnel_id || !req.body.type_habilitation || !req.body.date_obtention) {
      console.error('Champs requis manquants');
      return res.status(400).send('Champs requis manquants: personnel_id, type_habilitation, date_obtention');
    }
    
    const habilitationId = await Habilitation.create(req.body);
    console.log('Habilitation créée avec ID:', habilitationId);
    
    res.redirect('/rh/habilitations?success=Habilitation créée avec succès');
  } catch (err) {
    console.error('Erreur création habilitation:', err);
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire édition habilitation
router.get('/habilitations/edit/:id', async (req, res) => {
  try {
    const habilitation = await Habilitation.getById(req.params.id);
    
    if (!habilitation) {
      return res.status(404).send('Habilitation non trouvée');
    }
    
    const pool = await getConnection();
    const personnel = await pool.request().query(
      'SELECT id, prenom, nom, type_personnel FROM Personnel WHERE statut = \'Actif\' ORDER BY nom'
    );
    
    const formations = await pool.request().query(
      'SELECT id, titre FROM Formations WHERE statut = \'Terminée\' ORDER BY date_fin DESC'
    );
    
    res.render('rh/habilitations-form', { 
      habilitation,
      personnel: personnel.recordset,
      formations: formations.recordset,
      currentPage: 'habilitations'
    });
  } catch (err) {
    console.error('Erreur édition habilitation:', err);
    res.redirect('/rh/habilitations');
  }
});

// Mettre à jour habilitation (CORRIGÉ)
router.post('/habilitations/update/:id', async (req, res) => {
  try {
    console.log('Mise à jour habilitation:', req.params.id, req.body);
    
    await Habilitation.update(req.params.id, req.body);
    res.redirect('/rh/habilitations?success=Habilitation modifiée avec succès');
  } catch (err) {
    console.error('Erreur modification habilitation:', err);
    res.redirect('/rh/habilitations?error=Erreur lors de la modification');
  }
});

// Supprimer habilitation (désactiver)
router.post('/habilitations/:id/delete', async (req, res) => {
  try {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE Habilitations SET statut = \'Inactive\' WHERE id = @id');
    
    res.json({ success: true, message: 'Habilitation supprimée' });
  } catch (err) {
    console.error('Erreur suppression habilitation:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
  }
});

// Habilitations par personnel
router.get('/habilitations/personnel/:id', async (req, res) => {
  try {
    const habilitations = await Habilitation.getByPersonnel(req.params.id);
    res.json(habilitations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Valider participation
// ==================== REMPLACER dans routes/rh.js ====================
// Remplacer la route POST '/formations/valider/:inscriptionId' existante par celle-ci

// Valider participation (CORRIGÉ)
router.post('/formations/valider/:inscriptionId', async (req, res) => {
  try {
    const inscriptionId = req.params.inscriptionId;
    const { note_evaluation, certificat_obtenu } = req.body;
    
    console.log('Validation demandée pour:', {
      inscriptionId,
      note_evaluation,
      certificat_obtenu
    });

    await Formation.validerParticipation(
      inscriptionId, 
      note_evaluation, 
      certificat_obtenu
    );
    
    res.json({ 
      success: true, 
      message: 'Participation validée avec succès' 
    });
  } catch (err) {
    console.error('Erreur validation participation:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la validation',
      error: err.message 
    });
  }
});





// ========== ÉVALUATIONS ==========

// Liste des évaluations
router.get('/evaluations', async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        e.*,
        CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
        p.type_personnel,
        CONCAT(ev.prenom, ' ', ev.nom) as evaluateur_nom
      FROM Evaluations e
      INNER JOIN Personnel p ON e.personnel_id = p.id
      LEFT JOIN Personnel ev ON e.evaluateur_id = ev.id
      ORDER BY e.date_evaluation DESC
    `);
    res.render('rh/evaluations-list', { 
      evaluations: result.recordset,
      currentPage: 'evaluations'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire ajout évaluation
router.get('/evaluations/add', async (req, res) => {
  try {
    const pool = await getConnection();
    const personnel = await pool.request().query(
      'SELECT id, prenom, nom, type_personnel FROM Personnel WHERE statut = \'Actif\' ORDER BY nom'
    );
    res.render('rh/evaluations-form', { 
      evaluation: null, 
      personnel: personnel.recordset,
      currentPage: 'evaluations'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Créer évaluation
router.post('/evaluations/create', async (req, res) => {
  try {
    await Evaluation.create(req.body);
    res.redirect('/rh/evaluations');
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// ========== BESOINS EN FORMATION ==========

// Liste des besoins
router.get('/besoins-formation', async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        bf.*,
        CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
        p.type_personnel,
        CONCAT(d.prenom, ' ', d.nom) as demandeur_nom
      FROM BesoinsFormation bf
      INNER JOIN Personnel p ON bf.personnel_id = p.id
      LEFT JOIN Personnel d ON bf.demandeur_id = d.id
      ORDER BY bf.date_demande DESC
    `);
    res.render('rh/besoins-formation-list', { 
      besoins: result.recordset,
      currentPage: 'formations'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire demande de formation
router.get('/besoins-formation/add', async (req, res) => {
  try {
    const pool = await getConnection();
    const personnel = await pool.request().query(
      'SELECT id, prenom, nom FROM Personnel WHERE statut = \'Actif\' ORDER BY nom'
    );
    res.render('rh/besoins-formation-form', { 
      personnel: personnel.recordset,
      currentPage: 'formations'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Créer besoin formation
router.post('/besoins-formation/create', async (req, res) => {
  try {
    const pool = await getConnection();
    await pool.request()
      .input('personnel_id', sql.Int, req.body.personnel_id)
      .input('demandeur_id', sql.Int, req.body.demandeur_id)
      .input('type_formation', sql.VarChar, req.body.type_formation)
      .input('justification', sql.Text, req.body.justification)
      .input('priorite', sql.VarChar, req.body.priorite || 'Moyenne')
      .query(`
        INSERT INTO BesoinsFormation (personnel_id, demandeur_id, type_formation, justification, priorite)
        VALUES (@personnel_id, @demandeur_id, @type_formation, @justification, @priorite)
      `);
    res.redirect('/rh/besoins-formation');
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// ========== DASHBOARD RH ==========
router.get('/dashboard', async (req, res) => {
  try {
    const pool = await getConnection();
    
    const stats = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM Postes WHERE statut = 'Actif') as total_postes,
        (SELECT COUNT(*) FROM Formations WHERE statut IN ('Planifiée', 'En cours')) as formations_actives,
        (SELECT COUNT(*) FROM Habilitations WHERE statut = 'Active') as habilitations_actives,
        (SELECT COUNT(*) FROM vw_HabilitationsARenouveler) as habilitations_a_renouveler,
        (SELECT COUNT(*) FROM Recrutements WHERE statut = 'Ouvert') as recrutements_ouverts,
        (SELECT COUNT(*) FROM BesoinsFormation WHERE statut = 'En attente') as besoins_en_attente
    `);
    
    res.render('rh/dashboard', { 
      stats: stats.recordset[0],
      currentPage: 'rh-dashboard'
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// ============ COMPÉTENCES ============

// Liste des compétences
router.get('/competences', async (req, res) => {
  try {
    const competences = await Competence.getAll();
    const categories = await Competence.getCategories();
    const statistiques = await Competence.getStatistiques();

    res.render('rh/competences/list', {
      competences,
      categories,
      statistiques,
      currentPage: 'competences'
    });
  } catch (err) {
    console.error('Erreur liste compétences:', err);
    res.status(500).render('error', {
      title: 'Erreur',
      message: 'Impossible de charger les compétences',
      error: err,
      currentPage: 'competences'
    });
  }
});

// Formulaire nouvelle compétence
router.get('/competences/nouveau', async (req, res) => {
  try {
    const categories = await Competence.getCategories();
    res.render('rh/competences/form', {
      competence: null,
      categories,
      currentPage: 'competences'
    });
  } catch (err) {
    console.error('Erreur form compétence:', err);
    res.redirect('/rh/competences');
  }
});

// Créer une compétence
router.post('/competences/nouveau', async (req, res) => {
  try {
    await Competence.create(req.body);
    res.redirect('/rh/competences?success=Compétence créée avec succès');
  } catch (err) {
    console.error('Erreur création compétence:', err);
    res.redirect('/rh/competences?error=Erreur lors de la création');
  }
});

// Formulaire édition compétence
router.get('/competences/:id/edit', async (req, res) => {
  try {
    const competence = await Competence.getById(req.params.id);
    const categories = await Competence.getCategories();
    
    res.render('rh/competences/form', {
      competence,
      categories,
      currentPage: 'competences'
    });
  } catch (err) {
    console.error('Erreur édition compétence:', err);
    res.redirect('/rh/competences');
  }
});

// Mettre à jour une compétence
router.post('/competences/:id/edit', async (req, res) => {
  try {
    await Competence.update(req.params.id, req.body);
    res.redirect('/rh/competences?success=Compétence modifiée avec succès');
  } catch (err) {
    console.error('Erreur modification compétence:', err);
    res.redirect('/rh/competences?error=Erreur lors de la modification');
  }
});

// Supprimer une compétence
router.post('/competences/:id/delete', async (req, res) => {
  try {
    await Competence.delete(req.params.id);
    res.json({ success: true, message: 'Compétence supprimée' });
  } catch (err) {
    console.error('Erreur suppression compétence:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
  }
});

// Détails d'une compétence (MODIFIÉ - avec postes)
router.get('/competences/:id', async (req, res) => {
  try {
    const competence = await Competence.getById(req.params.id);
    
    const pool = await getConnection();
    
    // Personnel ayant cette compétence
    const personnels = await pool.request()
      .input('competenceId', sql.Int, req.params.id)
      .query(`
        SELECT 
          p.id, p.nom, p.prenom, p.matricule,
          cp.niveau, cp.date_acquisition, cp.date_evaluation
        FROM Personnel p
        INNER JOIN CompetencesPersonnel cp ON p.id = cp.personnel_id
        WHERE cp.competence_id = @competenceId
        ORDER BY p.nom, p.prenom
      `);

    // Postes associés à cette compétence
    const postesAssocies = await pool.request()
      .input('competenceId', sql.Int, req.params.id)
      .query(`
        SELECT 
          po.id, po.code, po.titre,
          d.nom as departement_nom,
          cpo.niveau_requis
        FROM Postes po
        INNER JOIN CompetencesPostes cpo ON po.id = cpo.poste_id
        LEFT JOIN Departements d ON po.departement_id = d.id
        WHERE cpo.competence_id = @competenceId
        ORDER BY d.nom, po.titre
      `);

    // Tous les personnels actifs pour le formulaire
    const tousPersonnels = await Personnel.getAll();
    
    // Tous les postes actifs pour le formulaire
    const tousPostes = await Poste.getAll();

    res.render('rh/competences/details', {
      competence,
      personnels: personnels.recordset,
      postesAssocies: postesAssocies.recordset,
      tousPersonnels: tousPersonnels,
      tousPostes: tousPostes,
      canManage: true,
      currentPage: 'competences'
    });
  } catch (err) {
    console.error('Erreur détails compétence:', err);
    res.redirect('/rh/competences');
  }
});

// Affecter une compétence à un personnel
router.post('/competences/affecter-personnel', async (req, res) => {
  try {
    await Competence.affecterPersonnel(req.body);
    res.json({ success: true, message: 'Compétence affectée au personnel' });
  } catch (err) {
    console.error('Erreur affectation compétence:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de l\'affectation' });
  }
});

// Affecter une compétence à un poste
router.post('/competences/affecter-poste', async (req, res) => {
  try {
    await Competence.affecterPoste(req.body);
    res.json({ success: true, message: 'Compétence affectée au poste' });
  } catch (err) {
    console.error('Erreur affectation compétence poste:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de l\'affectation' });
  }
});

// ==================== À AJOUTER dans routes/rh.js ====================
// APRÈS la route router.get('/formations/add', ...)

// Éditer formation
router.get('/formations/edit/:id', async (req, res) => {
  try {
    const formation = await Formation.getById(req.params.id);
    res.render('rh/formations-form', { 
      formation,
      currentPage: 'formations'
    });
  } catch (err) {
    console.error('Erreur édition formation:', err);
    res.redirect('/rh/formations');
  }
});

// Mettre à jour formation
router.post('/formations/update/:id', async (req, res) => {
  try {
    await Formation.update(req.params.id, req.body);
    res.redirect('/rh/formations?success=Formation modifiée avec succès');
  } catch (err) {
    console.error('Erreur modification formation:', err);
    res.redirect('/rh/formations?error=Erreur lors de la modification');
  }
});

// Supprimer formation
router.post('/formations/:id/delete', async (req, res) => {
  try {
    await Formation.delete(req.params.id);
    res.json({ success: true, message: 'Formation supprimée' });
  } catch (err) {
    console.error('Erreur suppression formation:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
  }
});

// ==================== Section HABILITATIONS dans routes/rh.js ====================
// REMPLACEZ TOUTE LA SECTION HABILITATIONS par ce code propre

// ========== HABILITATIONS ==========

// Liste des habilitations
router.get('/habilitations', async (req, res) => {
  try {
    const habilitations = await Habilitation.getAll();
    const aRenouveler = await Habilitation.getARenouveler(90);
    
    res.render('rh/habilitations-list', { 
      habilitations,
      aRenouveler,
      currentPage: 'habilitations'
    });
  } catch (err) {
    console.error('Erreur liste habilitations:', err);
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire ajout habilitation
router.get('/habilitations/add', async (req, res) => {
  try {
    const pool = await getConnection();
    const personnel = await pool.request().query(
      'SELECT id, prenom, nom, type_personnel FROM Personnel WHERE statut = \'Actif\' ORDER BY nom'
    );
    const formations = await pool.request().query(
      'SELECT id, titre FROM Formations ORDER BY titre'
    );
    
    res.render('rh/habilitations-form', { 
      habilitation: null, 
      personnel: personnel.recordset,
      formations: formations.recordset,
      currentPage: 'habilitations'
    });
  } catch (err) {
    console.error('Erreur formulaire habilitation:', err);
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Créer habilitation
router.post('/habilitations/create', async (req, res) => {
  try {
    console.log('===== DEBUG HABILITATION =====');
    console.log('req.body:', req.body);
    console.log('req.body type:', typeof req.body);
    console.log('req.body keys:', Object.keys(req.body));
    console.log('============================');
    
    // Validation
    if (!req.body.personnel_id || !req.body.type_habilitation || !req.body.date_obtention) {
      console.error('Champs requis manquants');
      console.error('Reçu:', {
        personnel_id: req.body.personnel_id,
        type_habilitation: req.body.type_habilitation,
        date_obtention: req.body.date_obtention
      });
      return res.status(400).send('Champs requis manquants');
    }
    
    const habilitationId = await Habilitation.create(req.body);
    console.log('Habilitation créée avec ID:', habilitationId);
    
    res.redirect('/rh/habilitations?success=Habilitation créée avec succès');
  } catch (err) {
    console.error('Erreur création habilitation:', err);
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire édition habilitation
router.get('/habilitations/edit/:id', async (req, res) => {
  try {
    const habilitation = await Habilitation.getById(req.params.id);
    
    if (!habilitation) {
      return res.status(404).send('Habilitation non trouvée');
    }
    
    const pool = await getConnection();
    const personnel = await pool.request().query(
      'SELECT id, prenom, nom, type_personnel FROM Personnel WHERE statut = \'Actif\' ORDER BY nom'
    );
    
    const formations = await pool.request().query(
      'SELECT id, titre FROM Formations ORDER BY titre'
    );
    
    res.render('rh/habilitations-form', { 
      habilitation,
      personnel: personnel.recordset,
      formations: formations.recordset,
      currentPage: 'habilitations'
    });
  } catch (err) {
    console.error('Erreur édition habilitation:', err);
    res.redirect('/rh/habilitations');
  }
});

// Mettre à jour habilitation
router.post('/habilitations/update/:id', async (req, res) => {
  try {
    console.log('Mise à jour habilitation:', req.params.id, req.body);
    
    await Habilitation.update(req.params.id, req.body);
    res.redirect('/rh/habilitations?success=Habilitation modifiée avec succès');
  } catch (err) {
    console.error('Erreur modification habilitation:', err);
    res.redirect('/rh/habilitations?error=Erreur lors de la modification');
  }
});

// Supprimer habilitation
router.post('/habilitations/:id/delete', async (req, res) => {
  try {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE Habilitations SET statut = \'Inactive\' WHERE id = @id');
    
    res.json({ success: true, message: 'Habilitation supprimée' });
  } catch (err) {
    console.error('Erreur suppression habilitation:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
  }
});

// Habilitations par personnel (API)
router.get('/habilitations/personnel/:id', async (req, res) => {
  try {
    const habilitations = await Habilitation.getByPersonnel(req.params.id);
    res.json(habilitations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// ========== À MODIFIER dans la section COMPÉTENCES ==========
// Remplacer le middleware pour vérifier les permissions

// Liste des compétences (MODIFIÉ)
router.get('/competences', async (req, res) => {
  try {
    const competences = await Competence.getAll();
    const categories = await Competence.getCategories();
    const statistiques = await Competence.getStatistiques();

    res.render('rh/competences/list', {
      competences,
      categories,
      statistiques,
      canManage: true, // À adapter selon vos permissions
      currentPage: 'competences'
    });
  } catch (err) {
    console.error('Erreur liste compétences:', err);
    res.status(500).render('error', {
      title: 'Erreur',
      message: 'Impossible de charger les compétences',
      error: err,
      currentPage: 'competences'
    });
  }
});


// ==================== À AJOUTER dans routes/rh.js ====================
// AJOUTER CETTE ROUTE AVANT la route '/habilitations/personnel/:id'
// Pour éviter les conflits, les routes API doivent être placées en premier

// API: Détails d'une habilitation (NOUVELLE ROUTE)
router.get('/habilitations/api/:id', async (req, res) => {
  try {
    const habilitationId = req.params.id;
    
    // Récupérer les détails de l'habilitation
    const habilitation = await Habilitation.getById(habilitationId);
    
    if (!habilitation) {
      return res.status(404).json({
        success: false,
        message: 'Habilitation non trouvée'
      });
    }

    res.json({
      success: true,
      habilitation: habilitation
    });
  } catch (err) {
    console.error('Erreur API habilitation:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Habilitations par personnel (API) - GARDER CETTE ROUTE APRÈS
router.get('/habilitations/personnel/:id', async (req, res) => {
  try {
    const habilitations = await Habilitation.getByPersonnel(req.params.id);
    res.json(habilitations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== À AJOUTER dans routes/rh.js ====================
// PLACER CETTE ROUTE AVANT les autres routes d'évaluations
// (avant router.get('/evaluations', ...))

// API: Détails d'une évaluation (NOUVELLE ROUTE - CRITIQUE)
router.get('/evaluations/api/:id', async (req, res) => {
  try {
    const evaluationId = req.params.id;
    console.log('API: Récupération évaluation ID:', evaluationId);
    
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, evaluationId)
      .query(`
        SELECT 
          e.*,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          p.type_personnel,
          p.matricule,
          CONCAT(ev.prenom, ' ', ev.nom) as evaluateur_nom,
          ev.type_personnel as evaluateur_type,
          CONCAT(val.prenom, ' ', val.nom) as validateur_nom
        FROM Evaluations e
        INNER JOIN Personnel p ON e.personnel_id = p.id
        LEFT JOIN Personnel ev ON e.evaluateur_id = ev.id
        LEFT JOIN Personnel val ON e.validateur_id = val.id
        WHERE e.id = @id
      `);
    
    if (result.recordset.length === 0) {
      console.log('Évaluation non trouvée pour ID:', evaluationId);
      return res.status(404).json({ 
        success: false, 
        message: 'Évaluation non trouvée' 
      });
    }
    
    const evaluation = result.recordset[0];
    console.log('Évaluation trouvée:', evaluation.id);
    
    res.json({ 
      success: true, 
      evaluation: evaluation 
    });
  } catch (err) {
    console.error('Erreur API évaluation:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la récupération',
      error: err.message 
    });
  }
});

// ========== ÉVALUATIONS (routes existantes) ==========

// Liste des évaluations
router.get('/evaluations', async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        e.*,
        CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
        p.type_personnel,
        CONCAT(ev.prenom, ' ', ev.nom) as evaluateur_nom
      FROM Evaluations e
      INNER JOIN Personnel p ON e.personnel_id = p.id
      LEFT JOIN Personnel ev ON e.evaluateur_id = ev.id
      ORDER BY e.date_evaluation DESC
    `);
    res.render('rh/evaluations-list', { 
      evaluations: result.recordset,
      currentPage: 'evaluations'
    });
  } catch (err) {
    console.error('Erreur liste évaluations:', err);
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire ajout évaluation
router.get('/evaluations/add', async (req, res) => {
  try {
    const pool = await getConnection();
    const personnel = await pool.request().query(
      'SELECT id, prenom, nom, type_personnel FROM Personnel WHERE statut = \'Actif\' ORDER BY nom'
    );
    res.render('rh/evaluations-form', { 
      evaluation: null, 
      personnel: personnel.recordset,
      currentPage: 'evaluations'
    });
  } catch (err) {
    console.error('Erreur form évaluation:', err);
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Créer évaluation
router.post('/evaluations/create', async (req, res) => {
  try {
    await Evaluation.create(req.body);
    res.redirect('/rh/evaluations?success=Évaluation créée avec succès');
  } catch (err) {
    console.error('Erreur création évaluation:', err);
    res.redirect('/rh/evaluations?error=Erreur lors de la création');
  }
});

// ==================== À REMPLACER dans routes/rh.js ====================
// Route: Formulaire édition évaluation (CORRIGÉE)

router.get('/evaluations/edit/:id', async (req, res) => {
  try {
    console.log('=== ÉDITION ÉVALUATION ===');
    console.log('ID demandé:', req.params.id);
    
    const pool = await getConnection();
    
    // Récupérer l'évaluation avec toutes les infos
    const evalResult = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT 
          e.*,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          p.type_personnel
        FROM Evaluations e
        INNER JOIN Personnel p ON e.personnel_id = p.id
        WHERE e.id = @id
      `);
    
    console.log('Résultat requête:', evalResult.recordset.length, 'lignes');
    
    if (evalResult.recordset.length === 0) {
      console.log('Évaluation non trouvée');
      return res.redirect('/rh/evaluations?error=Évaluation non trouvée');
    }
    
    const evaluation = evalResult.recordset[0];
    console.log('Évaluation trouvée:', {
      id: evaluation.id,
      personnel_id: evaluation.personnel_id,
      type_evaluation: evaluation.type_evaluation,
      note_globale: evaluation.note_globale
    });
    
    // Récupérer la liste du personnel
    const personnel = await pool.request().query(
      'SELECT id, prenom, nom, type_personnel FROM Personnel WHERE statut = \'Actif\' ORDER BY nom'
    );
    
    console.log('Personnel disponible:', personnel.recordset.length, 'personnes');
    
    // Rendre la vue avec les données
    res.render('rh/evaluations-form', { 
      evaluation: evaluation, 
      personnel: personnel.recordset,
      currentPage: 'evaluations'
    });
  } catch (err) {
    console.error('Erreur édition évaluation:', err);
    console.error('Stack:', err.stack);
    res.redirect('/rh/evaluations?error=Erreur lors du chargement');
  }
});

// Route: Mettre à jour évaluation (CORRIGÉE)
router.post('/evaluations/update/:id', async (req, res) => {
  try {
    console.log('=== MISE À JOUR ÉVALUATION ===');
    console.log('ID:', req.params.id);
    console.log('Données reçues:', req.body);
    
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('personnel_id', sql.Int, req.body.personnel_id)
      .input('evaluateur_id', sql.Int, req.body.evaluateur_id)
      .input('type_evaluation', sql.VarChar, req.body.type_evaluation)
      .input('periode_debut', sql.Date, req.body.periode_debut)
      .input('periode_fin', sql.Date, req.body.periode_fin)
      .input('date_evaluation', sql.Date, req.body.date_evaluation)
      .input('note_globale', sql.Decimal(5,2), req.body.note_globale || null)
      .input('points_forts', sql.Text, req.body.points_forts || null)
      .input('points_amelioration', sql.Text, req.body.points_amelioration || null)
      .input('objectifs', sql.Text, req.body.objectifs || null)
      .input('commentaires', sql.Text, req.body.commentaires || null)
      .input('statut', sql.VarChar, req.body.statut || 'En cours')
      .query(`
        UPDATE Evaluations SET
          personnel_id = @personnel_id,
          evaluateur_id = @evaluateur_id,
          type_evaluation = @type_evaluation,
          periode_debut = @periode_debut,
          periode_fin = @periode_fin,
          date_evaluation = @date_evaluation,
          note_globale = @note_globale,
          points_forts = @points_forts,
          points_amelioration = @points_amelioration,
          objectifs = @objectifs,
          commentaires = @commentaires,
          statut = @statut
        WHERE id = @id
      `);
    
    console.log('Évaluation mise à jour avec succès');
    res.redirect('/rh/evaluations?success=Évaluation modifiée avec succès');
  } catch (err) {
    console.error('Erreur modification évaluation:', err);
    console.error('Stack:', err.stack);
    res.redirect('/rh/evaluations?error=Erreur lors de la modification');
  }
});

// Mettre à jour évaluation
router.post('/evaluations/update/:id', async (req, res) => {
  try {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('type_evaluation', sql.VarChar, req.body.type_evaluation)
      .input('periode_debut', sql.Date, req.body.periode_debut)
      .input('periode_fin', sql.Date, req.body.periode_fin)
      .input('date_evaluation', sql.Date, req.body.date_evaluation)
      .input('note_globale', sql.Decimal(5,2), req.body.note_globale || null)
      .input('points_forts', sql.Text, req.body.points_forts || null)
      .input('points_amelioration', sql.Text, req.body.points_amelioration || null)
      .input('objectifs', sql.Text, req.body.objectifs || null)
      .input('commentaires', sql.Text, req.body.commentaires || null)
      .input('statut', sql.VarChar, req.body.statut || 'En cours')
      .query(`
        UPDATE Evaluations SET
          type_evaluation = @type_evaluation,
          periode_debut = @periode_debut,
          periode_fin = @periode_fin,
          date_evaluation = @date_evaluation,
          note_globale = @note_globale,
          points_forts = @points_forts,
          points_amelioration = @points_amelioration,
          objectifs = @objectifs,
          commentaires = @commentaires,
          statut = @statut
        WHERE id = @id
      `);
    
    res.redirect('/rh/evaluations?success=Évaluation modifiée avec succès');
  } catch (err) {
    console.error('Erreur modification évaluation:', err);
    res.redirect('/rh/evaluations?error=Erreur lors de la modification');
  }
});

// Supprimer évaluation
router.post('/evaluations/:id/delete', async (req, res) => {
  try {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Evaluations WHERE id = @id');
    
    res.json({ success: true, message: 'Évaluation supprimée' });
  } catch (err) {
    console.error('Erreur suppression évaluation:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
  }
});

// Changer statut évaluation
router.post('/evaluations/:id/statut', async (req, res) => {
  try {
    const { statut } = req.body;
    const pool = await getConnection();
    
    let query = 'UPDATE Evaluations SET statut = @statut';
    const request = pool.request()
      .input('id', sql.Int, req.params.id)
      .input('statut', sql.VarChar, statut);
    
    // Si validation, enregistrer le validateur
    if (statut === 'Validée' && req.session.personnelId) {
      query += ', validateur_id = @validateur_id, date_validation = GETDATE()';
      request.input('validateur_id', sql.Int, req.session.personnelId);
    }
    
    query += ' WHERE id = @id';
    
    await request.query(query);
    
    res.json({ success: true, message: 'Statut modifié avec succès' });
  } catch (err) {
    console.error('Erreur changement statut:', err);
    res.status(500).json({ success: false, message: 'Erreur lors du changement de statut' });
  }
});

// Route d'impression d'une évaluation
router.get('/evaluations/print/:id', async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT 
          e.*,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          p.type_personnel,
          p.matricule,
          CONCAT(ev.prenom, ' ', ev.nom) as evaluateur_nom,
          CONCAT(val.prenom, ' ', val.nom) as validateur_nom
        FROM Evaluations e
        INNER JOIN Personnel p ON e.personnel_id = p.id
        LEFT JOIN Personnel ev ON e.evaluateur_id = ev.id
        LEFT JOIN Personnel val ON e.validateur_id = val.id
        WHERE e.id = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).send('Évaluation non trouvée');
    }
    
    res.render('rh/evaluations-print', { 
      evaluation: result.recordset[0],
      currentPage: 'evaluations'
    });
  } catch (err) {
    console.error('Erreur impression évaluation:', err);
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Évaluations par personnel
router.get('/evaluations/personnel/:id', async (req, res) => {
  try {
    const evaluations = await Evaluation.getByPersonnel(req.params.id);
    res.json({ success: true, evaluations });
  } catch (err) {
    console.error('Erreur évaluations personnel:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Liste du personnel actif (pour les formulaires d'affectation)
router.get('/api/personnel-actif', async (req, res) => {
  try {
    const personnel = await Personnel.getAll();
    res.json({
      success: true,
      personnel: personnel
    });
  } catch (err) {
    console.error('Erreur API personnel actif:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Dissocier une compétence d'un poste
router.post('/competences/dissocier-poste', async (req, res) => {
  try {
    const { competence_id, poste_id } = req.body;
    
    const pool = await getConnection();
    await pool.request()
      .input('competence_id', sql.Int, competence_id)
      .input('poste_id', sql.Int, poste_id)
      .query('DELETE FROM CompetencesPostes WHERE competence_id = @competence_id AND poste_id = @poste_id');
    
    res.json({ success: true, message: 'Compétence dissociée du poste' });
  } catch (err) {
    console.error('Erreur dissociation compétence poste:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la dissociation' });
  }
});


// ==================== À AJOUTER dans routes/rh.js ====================
// PLACER cette route AVANT les autres routes de postes (avant '/postes')

// API: Liste des postes disponibles (avec places vacantes)

module.exports = router;