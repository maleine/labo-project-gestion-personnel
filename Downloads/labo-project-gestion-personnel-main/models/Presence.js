// ==================== models/Presence.js (CORRIGÉ) ====================
const { getConnection, sql } = require('../database/config');

class Presence {
  /**
   * Récupère les présences du jour
   */
  static async getPresencesDuJour(date = new Date()) {
    try {
      const pool = await getConnection();
      const dateStr = date.toISOString().split('T')[0];
      
      const result = await pool.request()
        .input('date', sql.Date, dateStr)
        .query(`
          SELECT 
            p.id as personnel_id,
            CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
            p.matricule,
            p.type_personnel,
            COALESCE(d.nom, 'Non assigné') as departement,
            FORMAT(entree.heure, 'HH:mm') as heure_entree,
            FORMAT(sortie.heure, 'HH:mm') as heure_sortie,
            pj.statut,
            pj.retard_minutes,
            pj.temps_travail_minutes,
            CASE 
              WHEN pj.statut = 'Présent' THEN 'Présent'
              WHEN c.id IS NOT NULL THEN 'Congé'
              ELSE 'Absent'
            END as statut_final
          FROM Personnel p
          LEFT JOIN Departements d ON p.departement_id = d.id
          LEFT JOIN PresencesJournalieres pj ON p.id = pj.personnel_id 
            AND pj.date = @date
          LEFT JOIN Pointages entree ON p.id = entree.personnel_id 
            AND CAST(entree.heure AS DATE) = @date
            AND entree.type = 'Entrée'
          LEFT JOIN Pointages sortie ON p.id = sortie.personnel_id 
            AND CAST(sortie.heure AS DATE) = @date
            AND sortie.type = 'Sortie'
          LEFT JOIN Conges c ON p.id = c.personnel_id
            AND @date BETWEEN c.date_debut AND c.date_fin
            AND c.statut = 'Approuvé'
          WHERE p.actif = 1
          ORDER BY personnel_nom
        `);
      
      return result.recordset;
    } catch (err) {
      console.error('Erreur getPresencesDuJour:', err);
      throw err;
    }
  }

  /**
   * Récupère les présences sur une période
   */
  static async getPresencesParPeriode(dateDebut, dateFin, personnelId = null) {
    try {
      const pool = await getConnection();
      
      let query = `
        SELECT 
          pj.id,
          pj.date,
          pj.personnel_id,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          p.matricule,
          p.type_personnel,
          COALESCE(d.nom, 'Non assigné') as departement,
          FORMAT(entree.heure, 'HH:mm') as heure_entree,
          FORMAT(sortie.heure, 'HH:mm') as heure_sortie,
          pj.statut,
          pj.retard_minutes,
          pj.temps_travail_minutes,
          pj.heures_supplementaires_minutes,
          pj.valide,
          pj.commentaire
        FROM PresencesJournalieres pj
        INNER JOIN Personnel p ON pj.personnel_id = p.id
        LEFT JOIN Departements d ON p.departement_id = d.id
        LEFT JOIN Pointages entree ON pj.personnel_id = entree.personnel_id 
          AND CAST(entree.heure AS DATE) = pj.date
          AND entree.type = 'Entrée'
        LEFT JOIN Pointages sortie ON pj.personnel_id = sortie.personnel_id 
          AND CAST(sortie.heure AS DATE) = pj.date
          AND sortie.type = 'Sortie'
        WHERE pj.date >= @date_debut AND pj.date <= @date_fin
      `;
      
      if (personnelId) {
        query += ` AND pj.personnel_id = @personnel_id`;
      }
      
      query += ` ORDER BY pj.date DESC, personnel_nom`;
      
      const request = pool.request()
        .input('date_debut', sql.Date, dateDebut)
        .input('date_fin', sql.Date, dateFin);
      
      if (personnelId) {
        request.input('personnel_id', sql.Int, personnelId);
      }
      
      const result = await request.query(query);
      return result.recordset;
    } catch (err) {
      console.error('Erreur getPresencesParPeriode:', err);
      throw err;
    }
  }

  /**
   * Récupère les statistiques d'un personnel pour un mois
   */
  static async getStatistiquesPersonnel(personnelId, mois = new Date().getMonth() + 1, annee = new Date().getFullYear()) {
    try {
      const pool = await getConnection();
      
      const result = await pool.request()
        .input('personnel_id', sql.Int, personnelId)
        .input('mois', sql.Int, mois)
        .input('annee', sql.Int, annee)
        .query(`
          SELECT 
            COUNT(*) as jours_travailles,
            COUNT(CASE WHEN statut = 'Présent' THEN 1 END) as jours_presents,
            COUNT(CASE WHEN statut = 'Absent' THEN 1 END) as jours_absents,
            COUNT(CASE WHEN retard_minutes > 0 THEN 1 END) as nb_retards,
            COALESCE(SUM(retard_minutes), 0) as total_minutes_retard,
            COALESCE(SUM(temps_travail_minutes), 0) as total_minutes_travail,
            COALESCE(SUM(heures_supplementaires_minutes), 0) as total_heures_sup,
            CASE 
              WHEN COUNT(*) > 0 
              THEN CAST(AVG(CAST(temps_travail_minutes AS FLOAT)) AS DECIMAL(10,2))
              ELSE 0 
            END as moyenne_heures_jour,
            CASE 
              WHEN COUNT(*) > 0 
              THEN CAST((COUNT(CASE WHEN statut = 'Présent' THEN 1 END) * 100.0 / COUNT(*)) AS DECIMAL(5,2))
              ELSE 0 
            END as taux_presence
          FROM PresencesJournalieres
          WHERE personnel_id = @personnel_id
            AND MONTH(date) = @mois
            AND YEAR(date) = @annee
        `);
      
      return result.recordset[0] || {
        jours_travailles: 0,
        jours_presents: 0,
        jours_absents: 0,
        nb_retards: 0,
        total_minutes_retard: 0,
        total_minutes_travail: 0,
        total_heures_sup: 0,
        moyenne_heures_jour: 0,
        taux_presence: 0
      };
    } catch (err) {
      console.error('Erreur getStatistiquesPersonnel:', err);
      throw err;
    }
  }

  /**
   * Récupère les anomalies de présence
   */
  static async getAnomalies(dateDebut, dateFin, traitee = null) {
    try {
      const pool = await getConnection();
      
      let query = `
        SELECT 
          a.id,
          a.date,
          a.type_anomalie,
          a.description,
          a.details,
          a.severite,
          a.traitee,
          a.date_traitement,
          a.resolution,
          a.personnel_id,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          p.matricule,
          p.type_personnel,
          COALESCE(d.nom, 'Non assigné') as departement,
          CONCAT(traite.prenom, ' ', traite.nom) as traite_par_nom
        FROM AnomaliesPresence a
        INNER JOIN Personnel p ON a.personnel_id = p.id
        LEFT JOIN Departements d ON p.departement_id = d.id
        LEFT JOIN Personnel traite ON a.traite_par = traite.id
        WHERE a.date >= @date_debut AND a.date <= @date_fin
      `;
      
      if (traitee !== null) {
        query += ` AND a.traitee = @traitee`;
      }
      
      query += ` ORDER BY a.date DESC, a.severite DESC`;
      
      const request = pool.request()
        .input('date_debut', sql.Date, dateDebut)
        .input('date_fin', sql.Date, dateFin);
      
      if (traitee !== null) {
        request.input('traitee', sql.Bit, traitee);
      }
      
      const result = await request.query(query);
      return result.recordset;
    } catch (err) {
      console.error('Erreur getAnomalies:', err);
      throw err;
    }
  }

  /**
   * Traite une anomalie
   */
  static async traiterAnomalie(anomalieId, traiteParId, resolution) {
    try {
      const pool = await getConnection();
      
      await pool.request()
        .input('id', sql.Int, anomalieId)
        .input('traite_par', sql.Int, traiteParId)
        .input('resolution', sql.Text, resolution)
        .query(`
          UPDATE AnomaliesPresence
          SET traitee = 1,
              date_traitement = GETDATE(),
              traite_par = @traite_par,
              resolution = @resolution
          WHERE id = @id
        `);
      
      return { success: true };
    } catch (err) {
      console.error('Erreur traiterAnomalie:', err);
      throw err;
    }
  }

  /**
   * Récupère le mapping personnel-pointeuse
   */
  static async getMappingPersonnel() {
    try {
      const pool = await getConnection();
      
      const result = await pool.request().query(`
        SELECT 
          m.id,
          m.personnel_id,
          m.user_id_pointeuse,
          m.appareil_id,
          m.numero_badge,
          m.actif,
          m.date_creation,
          m.date_modification,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          p.matricule,
          p.type_personnel,
          COALESCE(d.nom, 'Non assigné') as departement,
          a.nom as appareil_nom,
          a.modele as appareil_modele
        FROM MappingPointeuse m
        INNER JOIN Personnel p ON m.personnel_id = p.id
        LEFT JOIN Departements d ON p.departement_id = d.id
        LEFT JOIN AppareilsPointage a ON m.appareil_id = a.id
        WHERE m.actif = 1
        ORDER BY personnel_nom
      `);
      
      return result.recordset;
    } catch (err) {
      console.error('Erreur getMappingPersonnel:', err);
      throw err;
    }
  }

  /**
   * Crée ou met à jour un mapping
   */
  static async creerMapping(data) {
    try {
      const pool = await getConnection();
      
      // Vérifier si le mapping existe déjà
      const existing = await pool.request()
        .input('personnel_id', sql.Int, data.personnel_id)
        .query(`
          SELECT id FROM MappingPointeuse 
          WHERE personnel_id = @personnel_id
        `);
      
      if (existing.recordset.length > 0) {
        // Mise à jour
        await pool.request()
          .input('personnel_id', sql.Int, data.personnel_id)
          .input('user_id_pointeuse', sql.VarChar, data.user_id_pointeuse)
          .input('appareil_id', sql.Int, data.appareil_id || null)
          .input('numero_badge', sql.VarChar, data.numero_badge || null)
          .query(`
            UPDATE MappingPointeuse
            SET user_id_pointeuse = @user_id_pointeuse,
                appareil_id = @appareil_id,
                numero_badge = @numero_badge,
                date_modification = GETDATE()
            WHERE personnel_id = @personnel_id
          `);
        
        return existing.recordset[0].id;
      } else {
        // Création
        const result = await pool.request()
          .input('personnel_id', sql.Int, data.personnel_id)
          .input('user_id_pointeuse', sql.VarChar, data.user_id_pointeuse)
          .input('appareil_id', sql.Int, data.appareil_id || null)
          .input('numero_badge', sql.VarChar, data.numero_badge || null)
          .query(`
            INSERT INTO MappingPointeuse (
              personnel_id, 
              user_id_pointeuse, 
              appareil_id, 
              numero_badge,
              actif
            )
            VALUES (
              @personnel_id, 
              @user_id_pointeuse, 
              @appareil_id, 
              @numero_badge,
              1
            );
            SELECT SCOPE_IDENTITY() AS id;
          `);
        
        return result.recordset[0].id;
      }
    } catch (err) {
      console.error('Erreur creerMapping:', err);
      throw err;
    }
  }

  /**
   * Supprime un mapping
   */
  static async supprimerMapping(personnelId) {
    try {
      const pool = await getConnection();
      
      await pool.request()
        .input('personnel_id', sql.Int, personnelId)
        .query(`
          UPDATE MappingPointeuse
          SET actif = 0,
              date_modification = GETDATE()
          WHERE personnel_id = @personnel_id
        `);
      
      return { success: true };
    } catch (err) {
      console.error('Erreur supprimerMapping:', err);
      throw err;
    }
  }

  /**
   * Valide une présence
   */
  static async validerPresence(presenceId, validateurId) {
    try {
      const pool = await getConnection();
      
      await pool.request()
        .input('id', sql.BigInt, presenceId)
        .input('validateur_id', sql.Int, validateurId)
        .query(`
          UPDATE PresencesJournalieres
          SET valide = 1,
              validateur_id = @validateur_id,
              date_validation = GETDATE()
          WHERE id = @id
        `);
      
      return { success: true };
    } catch (err) {
      console.error('Erreur validerPresence:', err);
      throw err;
    }
  }

  /**
   * Crée une présence journalière
   */
  static async creerPresenceJournaliere(data) {
    try {
      const pool = await getConnection();
      
      const result = await pool.request()
        .input('personnel_id', sql.Int, data.personnel_id)
        .input('date', sql.Date, data.date)
        .input('heure_entree', sql.Time, data.heure_entree || null)
        .input('heure_sortie', sql.Time, data.heure_sortie || null)
        .input('statut', sql.VarChar, data.statut)
        .input('retard_minutes', sql.Int, data.retard_minutes || 0)
        .input('temps_travail_minutes', sql.Int, data.temps_travail_minutes || 0)
        .query(`
          INSERT INTO PresencesJournalieres (
            personnel_id,
            date,
            heure_entree,
            heure_sortie,
            statut,
            retard_minutes,
            temps_travail_minutes
          )
          VALUES (
            @personnel_id,
            @date,
            @heure_entree,
            @heure_sortie,
            @statut,
            @retard_minutes,
            @temps_travail_minutes
          );
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      return result.recordset[0].id;
    } catch (err) {
      console.error('Erreur creerPresenceJournaliere:', err);
      throw err;
    }
  }

  /**
   * Met à jour une présence journalière
   */
  static async mettreAJourPresence(presenceId, data) {
    try {
      const pool = await getConnection();
      
      let updates = [];
      let request = pool.request().input('id', sql.BigInt, presenceId);
      
      if (data.heure_entree !== undefined) {
        updates.push('heure_entree = @heure_entree');
        request.input('heure_entree', sql.Time, data.heure_entree);
      }
      if (data.heure_sortie !== undefined) {
        updates.push('heure_sortie = @heure_sortie');
        request.input('heure_sortie', sql.Time, data.heure_sortie);
      }
      if (data.statut !== undefined) {
        updates.push('statut = @statut');
        request.input('statut', sql.VarChar, data.statut);
      }
      if (data.retard_minutes !== undefined) {
        updates.push('retard_minutes = @retard_minutes');
        request.input('retard_minutes', sql.Int, data.retard_minutes);
      }
      if (data.temps_travail_minutes !== undefined) {
        updates.push('temps_travail_minutes = @temps_travail_minutes');
        request.input('temps_travail_minutes', sql.Int, data.temps_travail_minutes);
      }
      if (data.commentaire !== undefined) {
        updates.push('commentaire = @commentaire');
        request.input('commentaire', sql.Text, data.commentaire);
      }
      
      if (updates.length === 0) {
        return { success: false, message: 'Aucune donnée à mettre à jour' };
      }
      
      await request.query(`
        UPDATE PresencesJournalieres
        SET ${updates.join(', ')},
            date_modification = GETDATE()
        WHERE id = @id
      `);
      
      return { success: true };
    } catch (err) {
      console.error('Erreur mettreAJourPresence:', err);
      throw err;
    }
  }
}

module.exports = Presence;