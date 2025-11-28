// ==================== models/Evaluation.js ====================
const { getConnection, sql } = require('../database/config');

class Evaluation {
  static async create(data) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnel_id', sql.Int, data.personnel_id)
      .input('evaluateur_id', sql.Int, data.evaluateur_id)
      .input('type_evaluation', sql.VarChar, data.type_evaluation)
      .input('periode_debut', sql.Date, data.periode_debut)
      .input('periode_fin', sql.Date, data.periode_fin)
      .input('note_globale', sql.Decimal(5,2), data.note_globale || null)
      .input('points_forts', sql.Text, data.points_forts || null)
      .input('points_amelioration', sql.Text, data.points_amelioration || null)
      .input('objectifs', sql.Text, data.objectifs || null)
      .input('commentaires', sql.Text, data.commentaires || null)
      .query(`
        INSERT INTO Evaluations (personnel_id, evaluateur_id, type_evaluation, periode_debut, periode_fin,
                                note_globale, points_forts, points_amelioration, objectifs, commentaires)
        VALUES (@personnel_id, @evaluateur_id, @type_evaluation, @periode_debut, @periode_fin,
                @note_globale, @points_forts, @points_amelioration, @objectifs, @commentaires);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    return result.recordset[0].id;
  }

  static async getByPersonnel(personnelId, annee = null) {
    const pool = await getConnection();
    let query = `
      SELECT 
        e.*,
        CONCAT(ev.prenom, ' ', ev.nom) as evaluateur_nom,
        CONCAT(val.prenom, ' ', val.nom) as validateur_nom
      FROM Evaluations e
      LEFT JOIN Personnel ev ON e.evaluateur_id = ev.id
      LEFT JOIN Personnel val ON e.validateur_id = val.id
      WHERE e.personnel_id = @personnel_id
    `;
    
    if (annee) {
      query += ` AND YEAR(e.date_evaluation) = @annee`;
    }
    
    query += ` ORDER BY e.date_evaluation DESC`;
    
    const request = pool.request().input('personnel_id', sql.Int, personnelId);
    if (annee) {
      request.input('annee', sql.Int, annee);
    }
    
    const result = await request.query(query);
    return result.recordset;
  }
}

module.exports = Evaluation;