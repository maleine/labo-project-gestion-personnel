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


// ==================== À ajouter dans routes/rh.js ====================

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
    const Poste = require('../models/Poste');
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
    
    // Récupérer les compétences requises pour le poste
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
    const Poste = require('../models/Poste');
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
    res.render('rh/departements-list', { departements });
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
    res.render('rh/departements-form', { departement: null, responsables: responsables.recordset });
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
    res.render('rh/departements-form', { departement, responsables: responsables.recordset });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
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
    res.render('rh/postes-list', { postes });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire ajout poste
router.get('/postes/add', async (req, res) => {
  try {
    const departements = await Departement.getAll();
    res.render('rh/postes-form', { poste: null, departements });
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
    res.render('rh/postes-form', { poste, departements });
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
    res.render('rh/formations-list', { formations });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire ajout formation
router.get('/formations/add', (req, res) => {
  res.render('rh/formations-form', { formation: null });
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
    res.render('rh/formations-details', { formation, participants, personnel: personnel.recordset });
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

// Valider participation
router.post('/formations/valider/:inscriptionId', async (req, res) => {
  try {
    await Formation.validerParticipation(
      req.params.inscriptionId, 
      req.body.note_evaluation, 
      req.body.certificat_obtenu === 'on'
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== HABILITATIONS ==========

// Liste des habilitations
router.get('/habilitations', async (req, res) => {
  try {
    const habilitations = await Habilitation.getAll();
    const aRenouveler = await Habilitation.getARenouveler(90);
    res.render('rh/habilitations-list', { habilitations, aRenouveler });
  } catch (err) {
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
      formations: formations.recordset 
    });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Créer habilitation
router.post('/habilitations/create', async (req, res) => {
  try {
    await Habilitation.create(req.body);
    res.redirect('/rh/habilitations');
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
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
    res.render('rh/evaluations-list', { evaluations: result.recordset });
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
    res.render('rh/evaluations-form', { evaluation: null, personnel: personnel.recordset });
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
    res.render('rh/besoins-formation-list', { besoins: result.recordset });
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
    res.render('rh/besoins-formation-form', { personnel: personnel.recordset });
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

// ========== RECRUTEMENTS ==========

// Liste des recrutements
router.get('/recrutements', async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        r.*,
        p.titre as poste_titre,
        d.nom as departement_nom
      FROM Recrutements r
      INNER JOIN Postes p ON r.poste_id = p.id
      LEFT JOIN Departements d ON p.departement_id = d.id
      ORDER BY r.date_ouverture DESC
    `);
    res.render('rh/recrutements-list', { recrutements: result.recordset });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Formulaire nouveau recrutement
router.get('/recrutements/add', async (req, res) => {
  try {
    const postes = await Poste.getAll();
    res.render('rh/recrutements-form', { recrutement: null, postes });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// Créer recrutement
router.post('/recrutements/create', async (req, res) => {
  try {
    const pool = await getConnection();
    await pool.request()
      .input('reference', sql.VarChar, req.body.reference)
      .input('poste_id', sql.Int, req.body.poste_id)
      .input('type_recrutement', sql.VarChar, req.body.type_recrutement)
      .input('nombre_postes', sql.Int, req.body.nombre_postes || 1)
      .input('date_ouverture', sql.Date, req.body.date_ouverture)
      .input('date_cloture', sql.Date, req.body.date_cloture || null)
      .input('description', sql.Text, req.body.description)
      .input('exigences', sql.Text, req.body.exigences)
      .input('demandeur_id', sql.Int, req.body.demandeur_id)
      .query(`
        INSERT INTO Recrutements (reference, poste_id, type_recrutement, nombre_postes, 
                                  date_ouverture, date_cloture, description, exigences, demandeur_id)
        VALUES (@reference, @poste_id, @type_recrutement, @nombre_postes,
                @date_ouverture, @date_cloture, @description, @exigences, @demandeur_id)
      `);
    res.redirect('/rh/recrutements');
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// ========== DASHBOARD RH ==========
router.get('/dashboard', async (req, res) => {
  try {
    const pool = await getConnection();
    
    // Statistiques générales
    const stats = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM Postes WHERE statut = 'Actif') as total_postes,
        (SELECT COUNT(*) FROM Formations WHERE statut IN ('Planifiée', 'En cours')) as formations_actives,
        (SELECT COUNT(*) FROM Habilitations WHERE statut = 'Active') as habilitations_actives,
        (SELECT COUNT(*) FROM vw_HabilitationsARenouveler) as habilitations_a_renouveler,
        (SELECT COUNT(*) FROM Recrutements WHERE statut = 'Ouvert') as recrutements_ouverts,
        (SELECT COUNT(*) FROM BesoinsFormation WHERE statut = 'En attente') as besoins_en_attente
    `);
    
    res.render('rh/dashboard', { stats: stats.recordset[0] });
  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});


// ==================== À ajouter dans routes/rh.js ====================



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

// Détails d'une compétence
router.get('/competences/:id', async (req, res) => {
  try {
    const competence = await Competence.getById(req.params.id);
    
    // Récupérer les personnels ayant cette compétence
    const pool = await getConnection();
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

    res.render('rh/competences/details', {
      competence,
      personnels: personnels.recordset,
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

module.exports = router;