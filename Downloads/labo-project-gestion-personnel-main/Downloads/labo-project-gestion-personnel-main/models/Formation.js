// ==================== models/Formation.js ====================
const { getConnection, sql } = require('../database/config');

class Formation {
  static async getAll() {
    const pool = await getConnection();
    // Utiliser la vue après avoir corrigé la base de données
    const result = await pool.request().query(`
      SELECT * FROM vw_FormationsAvecParticipants 
      WHERE statut = 'Actif'
      ORDER BY date_debut DESC
    `);
    return result.recordset;
  }

  static async getById(id) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          f.*,
          COUNT(DISTINCT iif.personnel_id) as nb_participants,
          COUNT(DISTINCT CASE WHEN iif.statut = 'Validé' THEN iif.personnel_id END) as nb_valides
        FROM Formations f
        LEFT JOIN InscriptionsFormations iif ON f.id = iif.formation_id
        WHERE f.id = @id
        GROUP BY 
          f.id, f.reference, f.titre, f.type_formation, f.organisme, 
          f.duree_heures, f.date_debut, f.date_fin, f.cout, f.lieu, 
          f.description, f.objectifs, f.statut, f.created_at, f.updated_at
      `);
    return result.recordset[0];
  }

  static async create(data) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('reference', sql.VarChar, data.reference)
      .input('titre', sql.VarChar, data.titre)
      .input('type_formation', sql.VarChar, data.type_formation)
      .input('organisme', sql.VarChar, data.organisme || null)
      .input('duree_heures', sql.Int, data.duree_heures || null)
      .input('date_debut', sql.Date, data.date_debut || null)
      .input('date_fin', sql.Date, data.date_fin || null)
      .input('cout', sql.Decimal(10,2), data.cout || null)
      .input('lieu', sql.VarChar, data.lieu || null)
      .input('description', sql.VarChar(sql.MAX), data.description || null)
      .input('objectifs', sql.VarChar(sql.MAX), data.objectifs || null)
      .query(`
        INSERT INTO Formations (reference, titre, type_formation, organisme, duree_heures, 
                                date_debut, date_fin, cout, lieu, description, objectifs)
        VALUES (@reference, @titre, @type_formation, @organisme, @duree_heures,
                @date_debut, @date_fin, @cout, @lieu, @description, @objectifs);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    return result.recordset[0].id;
  }

  static async inscrirePersonnel(formationId, personnelId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('formation_id', sql.Int, formationId)
      .input('personnel_id', sql.Int, personnelId)
      .query(`
        INSERT INTO InscriptionsFormations (formation_id, personnel_id)
        VALUES (@formation_id, @personnel_id);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    return result.recordset[0].id;
  }

  static async getParticipants(formationId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('formation_id', sql.Int, formationId)
      .query(`
        SELECT 
          iif.*,
          CONCAT(p.prenom, ' ', p.nom) as nom_complet,
          p.email,
          p.type_personnel
        FROM InscriptionsFormations iif
        INNER JOIN Personnel p ON iif.personnel_id = p.id
        WHERE iif.formation_id = @formation_id
        ORDER BY p.nom, p.prenom
      `);
    return result.recordset;
  }

  static async validerParticipation(inscriptionId, note, certificat) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, inscriptionId)
      .input('note_evaluation', sql.Decimal(5,2), note || null)
      .input('certificat_obtenu', sql.Bit, certificat ? 1 : 0)
      .input('date_certificat', sql.Date, certificat ? new Date() : null)
      .query(`
        UPDATE InscriptionsFormations 
        SET statut = 'Validé',
            note_evaluation = @note_evaluation,
            certificat_obtenu = @certificat_obtenu,
            date_certificat = @date_certificat
        WHERE id = @id
      `);
  }

  static async update(id, data) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .input('titre', sql.VarChar, data.titre)
      .input('type_formation', sql.VarChar, data.type_formation)
      .input('organisme', sql.VarChar, data.organisme || null)
      .input('duree_heures', sql.Int, data.duree_heures || null)
      .input('date_debut', sql.Date, data.date_debut || null)
      .input('date_fin', sql.Date, data.date_fin || null)
      .input('cout', sql.Decimal(10,2), data.cout || null)
      .input('lieu', sql.VarChar, data.lieu || null)
      .input('description', sql.VarChar(sql.MAX), data.description || null)
      .input('objectifs', sql.VarChar(sql.MAX), data.objectifs || null)
      .query(`
        UPDATE Formations 
        SET titre = @titre,
            type_formation = @type_formation,
            organisme = @organisme,
            duree_heures = @duree_heures,
            date_debut = @date_debut,
            date_fin = @date_fin,
            cout = @cout,
            lieu = @lieu,
            description = @description,
            objectifs = @objectifs,
            updated_at = GETDATE()
        WHERE id = @id
      `);
  }

  static async delete(id) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE Formations SET statut = \'Inactif\' WHERE id = @id');
  }
}

module.exports = Formation;