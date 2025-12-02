// ==================== models/Habilitation.js ====================
const { getConnection, sql } = require('../database/config');

class Habilitation {
  static async getAll() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        h.*,
        CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
        p.type_personnel,
        DATEDIFF(DAY, GETDATE(), h.date_expiration) as jours_restants
      FROM Habilitations h
      INNER JOIN Personnel p ON h.personnel_id = p.id
      ORDER BY h.date_expiration
    `);
    return result.recordset;
  }

  static async getByPersonnel(personnelId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnel_id', sql.Int, personnelId)
      .query(`
        SELECT h.*, f.titre as formation_titre
        FROM Habilitations h
        LEFT JOIN Formations f ON h.formation_id = f.id
        WHERE h.personnel_id = @personnel_id
        ORDER BY h.date_obtention DESC
      `);
    return result.recordset;
  }

  static async create(data) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnel_id', sql.Int, data.personnel_id)
      .input('type_habilitation', sql.VarChar, data.type_habilitation)
      .input('code_habilitation', sql.VarChar, data.code_habilitation || null)
      .input('niveau', sql.VarChar, data.niveau || null)
      .input('date_obtention', sql.Date, data.date_obtention)
      .input('date_expiration', sql.Date, data.date_expiration || null)
      .input('formation_id', sql.Int, data.formation_id || null)
      .input('validateur_id', sql.Int, data.validateur_id || null)
      .input('fichier_path', sql.VarChar, data.fichier_path || null)
      .input('notes', sql.Text, data.notes || null)
      .query(`
        INSERT INTO Habilitations (personnel_id, type_habilitation, code_habilitation, niveau,
                                   date_obtention, date_expiration, formation_id, validateur_id,
                                   fichier_path, notes)
        VALUES (@personnel_id, @type_habilitation, @code_habilitation, @niveau,
                @date_obtention, @date_expiration, @formation_id, @validateur_id,
                @fichier_path, @notes);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    return result.recordset[0].id;
  }

  static async getARenouveler(joursAvant = 90) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('jours', sql.Int, joursAvant)
      .query(`
        SELECT * FROM vw_HabilitationsARenouveler 
        WHERE jours_restants <= @jours
        ORDER BY jours_restants
      `);
    return result.recordset;
  }
}

module.exports = Habilitation;