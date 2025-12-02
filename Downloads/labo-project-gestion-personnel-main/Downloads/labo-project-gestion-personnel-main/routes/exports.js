// ==================== routes/exports.js ====================
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const PDFGenerator = require('../utils/pdfGenerator');
const Personnel = require('../models/Personnel');
const Absence = require('../models/Absence');
const Formation = require('../models/Formation');
const { getConnection } = require('../database/config');

// Créer dossier exports s'il n'existe pas
const exportsDir = path.join(__dirname, '../exports');
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

// Page principale exports
router.get('/', (req, res) => {
  res.render('exports/index');
});

// ========== RAPPORT LISTE PERSONNEL ==========
router.get('/personnel/liste', async (req, res) => {
  try {
    const personnel = await Personnel.getAll();
    const pdf = new PDFGenerator();
    
    pdf.createDocument('Liste du Personnel');
    pdf.addHeader('LISTE DU PERSONNEL', 'Document généré automatiquement');

    // Statistiques
    const total = personnel.length;
    const biologistes = personnel.filter(p => p.type_personnel === 'Biologiste').length;
    const techniciens = personnel.filter(p => p.type_personnel === 'Technicien').length;
    const cadres = personnel.filter(p => p.type_personnel === 'Cadre').length;

    pdf.doc.fontSize(12).text(`Total: ${total} personnes`);
    pdf.doc.moveDown(1);

    // Tableau
    const headers = ['Matricule', 'Nom', 'Prénom', 'Type', 'Email'];
    const rows = personnel.map(p => [
      p.matricule,
      p.nom,
      p.prenom,
      p.type_personnel,
      p.email
    ]);

    pdf.addTable(headers, rows);

    const filename = `liste-personnel-${Date.now()}.pdf`;
    const filepath = path.join(exportsDir, filename);

    await pdf.finalize(filepath);

    res.download(filepath, filename, (err) => {
      if (err) {
        console.error(err);
      }
      // Supprimer le fichier après téléchargement
      setTimeout(() => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      }, 60000);
    });

  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// ========== RAPPORT ABSENCES MOIS ==========
router.get('/absences/mois', async (req, res) => {
  try {
    const mois = parseInt(req.query.mois) || new Date().getMonth() + 1;
    const annee = parseInt(req.query.annee) || new Date().getFullYear();
    
    const absences = await Absence.getCalendrierMois(mois, annee);
    
    const pdf = new PDFGenerator();
    pdf.createDocument('Rapport Absences');
    
    const moisNom = new Date(annee, mois - 1).toLocaleString('fr-FR', { month: 'long' });
    pdf.addHeader(
      'RAPPORT DES ABSENCES',
      `${moisNom.toUpperCase()} ${annee}`
    );

    // Statistiques
    const totalJours = absences.reduce((sum, a) => sum + parseFloat(a.nb_jours), 0);
    const parCategorie = {};
    absences.forEach(a => {
      parCategorie[a.categorie] = (parCategorie[a.categorie] || 0) + parseFloat(a.nb_jours);
    });

    pdf.addSection('Statistiques', 
      `Nombre total d'absences: ${absences.length}\n` +
      `Nombre total de jours: ${totalJours.toFixed(1)}`
    );

    // Tableau
    const headers = ['Personnel', 'Type', 'Du', 'Au', 'Jours', 'Statut'];
    const rows = absences.map(a => [
      a.personnel_nom,
      a.type_absence,
      new Date(a.date_debut).toLocaleDateString('fr-FR'),
      new Date(a.date_fin).toLocaleDateString('fr-FR'),
      a.nb_jours,
      a.statut
    ]);

    pdf.addTable(headers, rows);

    const filename = `absences-${mois}-${annee}-${Date.now()}.pdf`;
    const filepath = path.join(exportsDir, filename);

    await pdf.finalize(filepath);
    res.download(filepath, filename);

  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// ========== RAPPORT FORMATIONS ANNUEL ==========
router.get('/formations/annuel', async (req, res) => {
  try {
    const annee = parseInt(req.query.annee) || new Date().getFullYear();
    
    const pool = await getConnection();
    const formations = await pool.request().query(`
      SELECT 
        f.*,
        COUNT(iif.id) as nb_participants,
        COUNT(CASE WHEN iif.certificat_obtenu = 1 THEN 1 END) as nb_certifies
      FROM Formations f
      LEFT JOIN InscriptionsFormations iif ON f.id = iif.formation_id
      WHERE YEAR(f.date_debut) = ${annee}
      GROUP BY f.id, f.reference, f.titre, f.type_formation, f.organisme, 
               f.duree_heures, f.date_debut, f.date_fin, f.cout, f.lieu,
               f.description, f.objectifs, f.statut, f.created_at
      ORDER BY f.date_debut
    `);

    const pdf = new PDFGenerator();
    pdf.createDocument('Rapport Formations');
    pdf.addHeader('RAPPORT DES FORMATIONS', `Année ${annee}`);

    const data = formations.recordset;
    
    // Statistiques globales
    const totalFormations = data.length;
    const totalParticipants = data.reduce((sum, f) => sum + f.nb_participants, 0);
    const coutTotal = data.reduce((sum, f) => sum + (f.cout || 0), 0);

    pdf.addSection('Statistiques Globales',
      `Nombre de formations: ${totalFormations}\n` +
      `Total participants: ${totalParticipants}\n` +
      `Coût total: ${coutTotal.toLocaleString('fr-FR')} XOF`
    );

    // Tableau
    const headers = ['Référence', 'Titre', 'Type', 'Date', 'Participants', 'Statut'];
    const rows = data.map(f => [
      f.reference,
      f.titre,
      f.type_formation,
      f.date_debut ? new Date(f.date_debut).toLocaleDateString('fr-FR') : '-',
      f.nb_participants,
      f.statut
    ]);

    pdf.addTable(headers, rows);

    const filename = `formations-${annee}-${Date.now()}.pdf`;
    const filepath = path.join(exportsDir, filename);

    await pdf.finalize(filepath);
    res.download(filepath, filename);

  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// ========== FICHE INDIVIDUELLE PERSONNEL ==========
router.get('/personnel/:id/fiche', async (req, res) => {
  try {
    const personnelId = req.params.id;
    const personnel = await Personnel.getById(personnelId);
    
    if (!personnel) {
      return res.status(404).send('Personnel non trouvé');
    }

    const pdf = new PDFGenerator();
    pdf.createDocument(`Fiche Personnel - ${personnel.prenom} ${personnel.nom}`);
    pdf.addHeader('FICHE INDIVIDUELLE PERSONNEL', personnel.matricule);

    // Informations personnelles
    pdf.addSection('Informations Personnelles', '');
    pdf.doc.fontSize(10);
    pdf.doc.text(`Nom: ${personnel.nom}`);
    pdf.doc.text(`Prénom: ${personnel.prenom}`);
    pdf.doc.text(`Email: ${personnel.email}`);
    pdf.doc.text(`Téléphone: ${personnel.telephone || 'Non renseigné'}`);
    pdf.doc.text(`Date d'embauche: ${new Date(personnel.date_embauche).toLocaleDateString('fr-FR')}`);
    pdf.doc.moveDown(1);

    // Formations
    const pool = await getConnection();
    const formations = await pool.request().query(`
      SELECT f.titre, f.date_debut, iif.statut, iif.certificat_obtenu
      FROM InscriptionsFormations iif
      INNER JOIN Formations f ON iif.formation_id = f.id
      WHERE iif.personnel_id = ${personnelId}
      ORDER BY f.date_debut DESC
    `);

    if (formations.recordset.length > 0) {
      pdf.addSection('Formations', '');
      const headers = ['Formation', 'Date', 'Statut', 'Certifié'];
      const rows = formations.recordset.map(f => [
        f.titre,
        f.date_debut ? new Date(f.date_debut).toLocaleDateString('fr-FR') : '-',
        f.statut,
        f.certificat_obtenu ? 'Oui' : 'Non'
      ]);
      pdf.addTable(headers, rows);
    }

    const filename = `fiche-${personnel.matricule}-${Date.now()}.pdf`;
    const filepath = path.join(exportsDir, filename);

    await pdf.finalize(filepath);
    res.download(filepath, filename);

  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

// ========== RAPPORT HABILITATIONS ==========
router.get('/habilitations/rapport', async (req, res) => {
  try {
    const pool = await getConnection();
    const habilitations = await pool.request().query(`
      SELECT 
        h.*,
        CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
        p.type_personnel,
        DATEDIFF(DAY, GETDATE(), h.date_expiration) as jours_restants
      FROM Habilitations h
      INNER JOIN Personnel p ON h.personnel_id = p.id
      WHERE h.statut = 'Active'
      ORDER BY h.date_expiration
    `);

    const pdf = new PDFGenerator();
    pdf.createDocument('Rapport Habilitations');
    pdf.addHeader('RAPPORT DES HABILITATIONS', 'Habilitations actives');

    const data = habilitations.recordset;
    const totalHab = data.length;
    const aRenouveler = data.filter(h => h.jours_restants !== null && h.jours_restants < 90).length;

    pdf.addSection('Statistiques',
      `Total habilitations actives: ${totalHab}\n` +
      `À renouveler (< 90 jours): ${aRenouveler}`
    );

    const headers = ['Personnel', 'Type', 'Habilitation', 'Obtention', 'Expiration', 'Jours restants'];
    const rows = data.map(h => [
      h.personnel_nom,
      h.type_personnel,
      h.type_habilitation,
      new Date(h.date_obtention).toLocaleDateString('fr-FR'),
      h.date_expiration ? new Date(h.date_expiration).toLocaleDateString('fr-FR') : 'Illimitée',
      h.jours_restants !== null ? h.jours_restants : '-'
    ]);

    pdf.addTable(headers, rows);

    const filename = `habilitations-${Date.now()}.pdf`;
    const filepath = path.join(exportsDir, filename);

    await pdf.finalize(filepath);
    res.download(filepath, filename);

  } catch (err) {
    res.status(500).send('Erreur: ' + err.message);
  }
});

module.exports = router;
