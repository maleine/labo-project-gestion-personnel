const { getConnection, sql } = require('../database/config');

class Absence {
  static async creerDemande(data) {
    const pool = await getConnection();
    
    // Générer référence unique
    const reference = 'ABS-' + Date.now();
    
    const result = await pool.request()
      .input('reference', sql.VarChar, reference)
      .input('personnel_id', sql.Int, data.personnel_id)
      .input('type_absence_id', sql.Int, data.type_absence_id)
      .input('date_debut', sql.Date, data.date_debut)
      .input('date_fin', sql.Date, data.date_fin)
      .input('nb_jours', sql.Int, parseInt(data.nb_jours))
      .input('motif', sql.VarChar(sql.MAX), data.motif || null)
      .input('demandeur_id', sql.Int, data.demandeur_id || data.personnel_id)
      .query(`
        INSERT INTO DemandesAbsences (reference, personnel_id, type_absence_id, date_debut, date_fin, nb_jours, motif, demandeur_id)
        VALUES (@reference, @personnel_id, @type_absence_id, @date_debut, @date_fin, @nb_jours, @motif, @demandeur_id);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    return result.recordset[0].id;
  }

  static async getAll(filters = {}) {
    const pool = await getConnection();
    const request = pool.request();
    
    let query = `
      SELECT 
        da.*,
        CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
        p.type_personnel,
        ta.libelle as type_absence,
        ta.categorie,
        ta.couleur,
        CONCAT(v.prenom, ' ', v.nom) as validateur_nom,
        CONCAT(r.prenom, ' ', r.nom) as remplacant_nom
      FROM DemandesAbsences da
      INNER JOIN Personnel p ON da.personnel_id = p.id
      INNER JOIN TypesAbsences ta ON da.type_absence_id = ta.id
      LEFT JOIN Personnel v ON da.validateur_id = v.id
      LEFT JOIN Personnel r ON da.remplacant_id = r.id
      WHERE 1=1
    `;
    
    if (filters.statut) {
      query += ` AND da.statut = @statut`;
      request.input('statut', sql.VarChar, filters.statut);
    }
    
    if (filters.mois && filters.annee) {
      query += ` AND MONTH(da.date_debut) = @mois AND YEAR(da.date_debut) = @annee`;
      request.input('mois', sql.Int, filters.mois);
      request.input('annee', sql.Int, filters.annee);
    }
    
    if (filters.personnel_id) {
      query += ` AND da.personnel_id = @personnel_id`;
      request.input('personnel_id', sql.Int, filters.personnel_id);
    }
    
    query += ` ORDER BY da.date_debut DESC`;
    
    const result = await request.query(query);
    return result.recordset;
  }

  static async getById(id) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          da.*,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          ta.libelle as type_absence,
          ta.couleur,
          ta.categorie
        FROM DemandesAbsences da
        INNER JOIN Personnel p ON da.personnel_id = p.id
        INNER JOIN TypesAbsences ta ON da.type_absence_id = ta.id
        WHERE da.id = @id
      `);
    return result.recordset[0];
  }

  static async getByIdWithDetails(id) {
    const pool = await getConnection();
    
    const demandeResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          da.*,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          p.type_personnel,
          p.email as personnel_email,
          p.telephone as personnel_telephone,
          ta.libelle as type_absence,
          ta.categorie,
          ta.couleur,
          CONCAT(v.prenom, ' ', v.nom) as validateur_nom,
          CONCAT(r.prenom, ' ', r.nom) as remplacant_nom,
          CONCAT(d.prenom, ' ', d.nom) as demandeur_nom
        FROM DemandesAbsences da
        INNER JOIN Personnel p ON da.personnel_id = p.id
        INNER JOIN TypesAbsences ta ON da.type_absence_id = ta.id
        LEFT JOIN Personnel v ON da.validateur_id = v.id
        LEFT JOIN Personnel r ON da.remplacant_id = r.id
        LEFT JOIN Personnel d ON da.demandeur_id = d.id
        WHERE da.id = @id
      `);
    
    if (!demandeResult.recordset[0]) return null;
    const demande = demandeResult.recordset[0];

    const historiqueResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          hva.*,
          CONCAT(p.prenom, ' ', p.nom) as validateur_nom
        FROM HistoriqueValidationsAbsences hva
        LEFT JOIN Personnel p ON hva.validateur_id = p.id
        WHERE hva.demande_absence_id = @id
        ORDER BY hva.date_action DESC
      `);

    demande.historique = historiqueResult.recordset;

    if (demande.categorie === 'Congé' || demande.categorie === 'Congés payés') {
      const soldeResult = await pool.request()
        .input('personnel_id', sql.Int, demande.personnel_id)
        .input('annee', sql.Int, new Date(demande.date_debut).getFullYear())
        .query(`
          SELECT 
            solde_acquis,
            solde_pris,
            solde_restant
          FROM SoldesConges
          WHERE personnel_id = @personnel_id AND annee = @annee
        `);

      if (soldeResult.recordset[0]) {
        const solde = soldeResult.recordset[0];
        demande.solde_conges = {
          solde_avant: parseInt(solde.solde_restant) + parseInt(demande.nb_jours),
          solde_apres: parseInt(solde.solde_restant),
          total_acquis: parseInt(solde.solde_acquis),
          conges_pris: parseInt(solde.solde_pris)
        };
      }
    }

    return demande;
  }

  static async valider(id, validateurId, statut, commentaire = null) {
    const pool = await getConnection();
    const demande = await this.getById(id);
    if (!demande) throw new Error('Demande non trouvée');

    const annee = new Date(demande.date_debut).getFullYear();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      await transaction.request()
        .input('id', sql.Int, id)
        .input('statut', sql.VarChar, statut)
        .input('validateur_id', sql.Int, validateurId)
        .input('commentaire', sql.VarChar(sql.MAX), commentaire)
        .query(`
          UPDATE DemandesAbsences 
          SET statut = @statut,
              validateur_id = @validateur_id,
              date_validation = GETDATE(),
              commentaire_validation = @commentaire
          WHERE id = @id
        `);
      
      await transaction.request()
        .input('demande_id', sql.Int, id)
        .input('validateur_id', sql.Int, validateurId)
        .input('action', sql.VarChar, statut)
        .input('commentaire', sql.VarChar(sql.MAX), commentaire)
        .query(`
          INSERT INTO HistoriqueValidationsAbsences (demande_absence_id, validateur_id, action, commentaire)
          VALUES (@demande_id, @validateur_id, @action, @commentaire)
        `);

      if (statut === 'Approuvée' && (demande.categorie === 'Congé' || demande.categorie === 'Congés payés')) {
        const soldeCheck = await transaction.request()
          .input('personnel_id', sql.Int, demande.personnel_id)
          .input('annee', sql.Int, annee)
          .query(`
            SELECT id, solde_restant, solde_pris FROM SoldesConges 
            WHERE personnel_id = @personnel_id AND annee = @annee
          `);

        if (soldeCheck.recordset.length > 0) {
          await transaction.request()
            .input('personnel_id', sql.Int, demande.personnel_id)
            .input('annee', sql.Int, annee)
            .input('nb_jours', sql.Int, parseInt(demande.nb_jours))
            .query(`
              UPDATE SoldesConges 
              SET solde_pris = solde_pris + @nb_jours,
                  solde_restant = solde_restant - @nb_jours,
                  date_maj = GETDATE()
              WHERE personnel_id = @personnel_id AND annee = @annee
            `);
        } else {
          await transaction.request()
            .input('personnel_id', sql.Int, demande.personnel_id)
            .input('annee', sql.Int, annee)
            .input('solde_acquis', sql.Int, 30)
            .input('solde_pris', sql.Int, parseInt(demande.nb_jours))
            .input('solde_restant', sql.Int, 30 - parseInt(demande.nb_jours))
            .query(`
              INSERT INTO SoldesConges (personnel_id, annee, solde_acquis, solde_pris, solde_restant, created_at, date_maj)
              VALUES (@personnel_id, @annee, @solde_acquis, @solde_pris, @solde_restant, GETDATE(), GETDATE())
            `);
        }
      }

      if (statut === 'Refusée' && demande.statut === 'Approuvée' && 
          (demande.categorie === 'Congé' || demande.categorie === 'Congés payés')) {
        await transaction.request()
          .input('personnel_id', sql.Int, demande.personnel_id)
          .input('annee', sql.Int, annee)
          .input('nb_jours', sql.Int, parseInt(demande.nb_jours))
          .query(`
            UPDATE SoldesConges 
            SET solde_pris = solde_pris - @nb_jours,
                solde_restant = solde_restant + @nb_jours,
                date_maj = GETDATE()
            WHERE personnel_id = @personnel_id AND annee = @annee
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async getSoldeConges(personnelId, annee = new Date().getFullYear()) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnel_id', sql.Int, personnelId)
      .input('annee', sql.Int, annee)
      .query(`
        SELECT * FROM SoldesConges 
        WHERE personnel_id = @personnel_id AND annee = @annee
      `);
    return result.recordset[0];
  }

  static async getTypesAbsences() {
    const pool = await getConnection();
    const result = await pool.request()
      .query('SELECT * FROM TypesAbsences WHERE actif = 1 ORDER BY categorie, libelle');
    return result.recordset;
  }

  static async getCalendrierMois(mois, annee) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('mois', sql.Int, mois)
      .input('annee', sql.Int, annee)
      .query(`
        SELECT 
          da.*,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          ta.libelle as type_absence,
          ta.couleur
        FROM DemandesAbsences da
        INNER JOIN Personnel p ON da.personnel_id = p.id
        INNER JOIN TypesAbsences ta ON da.type_absence_id = ta.id
        WHERE MONTH(da.date_debut) = @mois AND YEAR(da.date_debut) = @annee
          AND da.statut = 'Approuvée'
        ORDER BY da.date_debut
      `);
    return result.recordset;
  }

  static async update(id, data) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .input('type_absence_id', sql.Int, data.type_absence_id)
      .input('date_debut', sql.Date, data.date_debut)
      .input('date_fin', sql.Date, data.date_fin)
      .input('nb_jours', sql.Int, parseInt(data.nb_jours))
      .input('motif', sql.VarChar(sql.MAX), data.motif || null)
      .query(`
        UPDATE DemandesAbsences 
        SET type_absence_id = @type_absence_id,
            date_debut = @date_debut,
            date_fin = @date_fin,
            nb_jours = @nb_jours,
            motif = @motif,
            updated_at = GETDATE()
        WHERE id = @id AND statut = 'En attente'
      `);
  }

  static async delete(id) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE DemandesAbsences SET statut = \'Annulée\' WHERE id = @id');
  }
}

module.exports = Absence;
