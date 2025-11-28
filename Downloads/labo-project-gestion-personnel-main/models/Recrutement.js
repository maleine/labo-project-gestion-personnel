// ==================== models/Recrutement.js ====================
const { getConnection } = require('../database/config');
const sql = require('mssql');

class Recrutement {
  /**
   * Récupérer tous les recrutements
   */
  static async getAll() {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(`
        SELECT 
          r.id, r.reference, r.type_recrutement, r.nombre_postes,
          r.date_ouverture, r.date_cloture, r.description, r.exigences,
          r.statut, r.date_validation, r.created_at,
          p.titre as poste_nom, p.code as poste_code,
          d.nom as demandeur_nom, d.prenom as demandeur_prenom,
          v.nom as valideur_nom, v.prenom as valideur_prenom
        FROM Recrutements r
        LEFT JOIN Postes p ON r.poste_id = p.id
        LEFT JOIN Personnel d ON r.demandeur_id = d.id
        LEFT JOIN Personnel v ON r.valideur_id = v.id
        ORDER BY r.date_ouverture DESC
      `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur getAll Recrutements:', err);
      throw err;
    }
  }

  /**
   * Récupérer un recrutement par ID
   */
  static async getById(id) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT 
            r.id, r.reference, r.poste_id, r.type_recrutement, r.nombre_postes,
            r.date_ouverture, r.date_cloture, r.description, r.exigences,
            r.statut, r.demandeur_id, r.valideur_id, r.date_validation, r.created_at,
            p.titre as poste_nom, p.code as poste_code,
            d.nom as demandeur_nom, d.prenom as demandeur_prenom,
            v.nom as valideur_nom, v.prenom as valideur_prenom
          FROM Recrutements r
          LEFT JOIN Postes p ON r.poste_id = p.id
          LEFT JOIN Personnel d ON r.demandeur_id = d.id
          LEFT JOIN Personnel v ON r.valideur_id = v.id
          WHERE r.id = @id
        `);
      return result.recordset[0];
    } catch (err) {
      console.error('Erreur getById Recrutement:', err);
      throw err;
    }
  }

  /**
   * Récupérer les recrutements par statut
   */
  static async getByStatut(statut) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('statut', sql.NVarChar, statut)
        .query(`
          SELECT 
            r.id, r.reference, r.type_recrutement, r.nombre_postes,
            r.date_ouverture, r.date_cloture, r.statut,
            p.titre as poste_nom, p.code as poste_code,
            d.nom as demandeur_nom, d.prenom as demandeur_prenom
          FROM Recrutements r
          LEFT JOIN Postes p ON r.poste_id = p.id
          LEFT JOIN Personnel d ON r.demandeur_id = d.id
          WHERE r.statut = @statut
          ORDER BY r.date_ouverture DESC
        `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur getByStatut:', err);
      throw err;
    }
  }

  /**
   * Récupérer les recrutements en cours
   */
  static async getEnCours() {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(`
        SELECT 
          r.id, r.reference, r.type_recrutement, r.nombre_postes,
          r.date_ouverture, r.date_cloture, r.statut,
          p.titre as poste_nom, p.code as poste_code,
          DATEDIFF(day, GETDATE(), r.date_cloture) as jours_restants
        FROM Recrutements r
        LEFT JOIN Postes p ON r.poste_id = p.id
        WHERE r.statut IN ('Ouvert', 'En cours')
          AND r.date_cloture >= GETDATE()
        ORDER BY r.date_cloture ASC
      `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur getEnCours:', err);
      throw err;
    }
  }

  /**
   * Créer un nouveau recrutement
   */
  static async create(data) {
    try {
      const pool = await getConnection();
      
      // Générer une référence automatique
      const refResult = await pool.request().query(`
        SELECT 'REC-' + FORMAT(YEAR(GETDATE()), '0000') + '-' + 
               FORMAT(COUNT(*) + 1, '000') as reference
        FROM Recrutements
        WHERE YEAR(created_at) = YEAR(GETDATE())
      `);
      const reference = refResult.recordset[0].reference;

      const result = await pool.request()
        .input('reference', sql.NVarChar, reference)
        .input('posteId', sql.Int, data.poste_id)
        .input('typeRecrutement', sql.NVarChar, data.type_recrutement)
        .input('nombrePostes', sql.Int, data.nombre_postes || 1)
        .input('dateOuverture', sql.Date, data.date_ouverture)
        .input('dateCloture', sql.Date, data.date_cloture)
        .input('description', sql.NVarChar, data.description || null)
        .input('exigences', sql.NVarChar, data.exigences || null)
        .input('statut', sql.NVarChar, data.statut || 'Brouillon')
        .input('demandeurId', sql.Int, data.demandeur_id)
        .query(`
          INSERT INTO Recrutements 
          (reference, poste_id, type_recrutement, nombre_postes, 
           date_ouverture, date_cloture, description, exigences, 
           statut, demandeur_id)
          OUTPUT INSERTED.id, INSERTED.reference
          VALUES (@reference, @posteId, @typeRecrutement, @nombrePostes,
                  @dateOuverture, @dateCloture, @description, @exigences,
                  @statut, @demandeurId)
        `);
      return result.recordset[0];
    } catch (err) {
      console.error('Erreur create Recrutement:', err);
      throw err;
    }
  }

  /**
   * Mettre à jour un recrutement
   */
  static async update(id, data) {
    try {
      const pool = await getConnection();
      await pool.request()
        .input('id', sql.Int, id)
        .input('posteId', sql.Int, data.poste_id)
        .input('typeRecrutement', sql.NVarChar, data.type_recrutement)
        .input('nombrePostes', sql.Int, data.nombre_postes)
        .input('dateOuverture', sql.Date, data.date_ouverture)
        .input('dateCloture', sql.Date, data.date_cloture)
        .input('description', sql.NVarChar, data.description || null)
        .input('exigences', sql.NVarChar, data.exigences || null)
        .query(`
          UPDATE Recrutements
          SET poste_id = @posteId,
              type_recrutement = @typeRecrutement,
              nombre_postes = @nombrePostes,
              date_ouverture = @dateOuverture,
              date_cloture = @dateCloture,
              description = @description,
              exigences = @exigences
          WHERE id = @id
        `);
      return true;
    } catch (err) {
      console.error('Erreur update Recrutement:', err);
      throw err;
    }
  }

  /**
   * Changer le statut d'un recrutement
   */
  static async changerStatut(id, statut, valideurId = null) {
    try {
      const pool = await getConnection();
      
      if (statut === 'Validé' && valideurId) {
        await pool.request()
          .input('id', sql.Int, id)
          .input('statut', sql.NVarChar, statut)
          .input('valideurId', sql.Int, valideurId)
          .query(`
            UPDATE Recrutements
            SET statut = @statut,
                valideur_id = @valideurId,
                date_validation = GETDATE()
            WHERE id = @id
          `);
      } else {
        await pool.request()
          .input('id', sql.Int, id)
          .input('statut', sql.NVarChar, statut)
          .query(`
            UPDATE Recrutements
            SET statut = @statut
            WHERE id = @id
          `);
      }
      return true;
    } catch (err) {
      console.error('Erreur changerStatut:', err);
      throw err;
    }
  }

  /**
   * Supprimer un recrutement
   */
  static async delete(id) {
    try {
      const pool = await getConnection();
      await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM Recrutements WHERE id = @id');
      return true;
    } catch (err) {
      console.error('Erreur delete Recrutement:', err);
      throw err;
    }
  }

  /**
   * Statistiques des recrutements
   */
  static async getStatistiques() {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(`
        SELECT 
          COUNT(*) as total_recrutements,
          COUNT(CASE WHEN statut = 'Ouvert' THEN 1 END) as recrutements_ouverts,
          COUNT(CASE WHEN statut = 'En cours' THEN 1 END) as recrutements_en_cours,
          COUNT(CASE WHEN statut = 'Cloturé' THEN 1 END) as recrutements_clotures,
          COUNT(CASE WHEN statut = 'Annulé' THEN 1 END) as recrutements_annules,
          SUM(nombre_postes) as total_postes,
          AVG(DATEDIFF(day, date_ouverture, ISNULL(date_cloture, GETDATE()))) as duree_moyenne
        FROM Recrutements
      `);
      return result.recordset[0];
    } catch (err) {
      console.error('Erreur getStatistiques:', err);
      throw err;
    }
  }

  /**
   * Récupérer les recrutements par année
   */
  static async getByYear(year) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('year', sql.Int, year)
        .query(`
          SELECT 
            r.id, r.reference, r.type_recrutement, r.nombre_postes,
            r.date_ouverture, r.statut,
            p.titre as poste_nom
          FROM Recrutements r
          LEFT JOIN Postes p ON r.poste_id = p.id
          WHERE YEAR(r.date_ouverture) = @year
          ORDER BY r.date_ouverture DESC
        `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur getByYear:', err);
      throw err;
    }
  }
}

module.exports = Recrutement;
