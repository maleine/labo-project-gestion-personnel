// ==================== models/Evaluation.js ====================
const { getConnection, sql } = require('../database/config');

class Evaluation {
  /**
   * Créer une nouvelle évaluation
   */
  static async create(data) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnel_id', sql.Int, data.personnel_id)
      .input('evaluateur_id', sql.Int, data.evaluateur_id)
      .input('type_evaluation', sql.VarChar, data.type_evaluation)
      .input('periode_debut', sql.Date, data.periode_debut)
      .input('periode_fin', sql.Date, data.periode_fin)
      .input('date_evaluation', sql.Date, data.date_evaluation || new Date())
      .input('note_globale', sql.Decimal(5,2), data.note_globale || null)
      .input('points_forts', sql.Text, data.points_forts || null)
      .input('points_amelioration', sql.Text, data.points_amelioration || null)
      .input('objectifs', sql.Text, data.objectifs || null)
      .input('commentaires', sql.Text, data.commentaires || null)
      .input('statut', sql.VarChar, data.statut || 'En cours')
      .query(`
        INSERT INTO Evaluations (
          personnel_id, evaluateur_id, type_evaluation, 
          periode_debut, periode_fin, date_evaluation,
          note_globale, points_forts, points_amelioration, 
          objectifs, commentaires, statut
        )
        VALUES (
          @personnel_id, @evaluateur_id, @type_evaluation,
          @periode_debut, @periode_fin, @date_evaluation,
          @note_globale, @points_forts, @points_amelioration,
          @objectifs, @commentaires, @statut
        );
        SELECT SCOPE_IDENTITY() AS id;
      `);
    return result.recordset[0].id;
  }

  /**
   * Récupérer une évaluation par ID
   */
  static async getById(id) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
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
    return result.recordset[0] || null;
  }

  /**
   * Récupérer toutes les évaluations
   */
  static async getAll() {
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
    return result.recordset;
  }

  /**
   * Récupérer les évaluations d'un personnel
   */
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

  /**
   * Mettre à jour une évaluation
   */
  static async update(id, data) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .input('type_evaluation', sql.VarChar, data.type_evaluation)
      .input('periode_debut', sql.Date, data.periode_debut)
      .input('periode_fin', sql.Date, data.periode_fin)
      .input('date_evaluation', sql.Date, data.date_evaluation)
      .input('note_globale', sql.Decimal(5,2), data.note_globale || null)
      .input('points_forts', sql.Text, data.points_forts || null)
      .input('points_amelioration', sql.Text, data.points_amelioration || null)
      .input('objectifs', sql.Text, data.objectifs || null)
      .input('commentaires', sql.Text, data.commentaires || null)
      .input('statut', sql.VarChar, data.statut || 'En cours')
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
  }

  /**
   * Supprimer une évaluation
   */
  static async delete(id) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Evaluations WHERE id = @id');
  }

  /**
   * Changer le statut d'une évaluation
   */
  static async changerStatut(id, statut, validateurId = null) {
    const pool = await getConnection();
    let query = 'UPDATE Evaluations SET statut = @statut';
    const request = pool.request()
      .input('id', sql.Int, id)
      .input('statut', sql.VarChar, statut);
    
    if (statut === 'Validée' && validateurId) {
      query += ', validateur_id = @validateur_id, date_validation = GETDATE()';
      request.input('validateur_id', sql.Int, validateurId);
    }
    
    query += ' WHERE id = @id';
    await request.query(query);
  }

  /**
   * Obtenir les statistiques des évaluations
   */
  static async getStatistiques() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN statut = 'Validée' THEN 1 END) as validees,
        COUNT(CASE WHEN statut = 'En cours' THEN 1 END) as en_cours,
        COUNT(CASE WHEN statut = 'Finalisée' THEN 1 END) as finalisees,
        AVG(CASE WHEN note_globale IS NOT NULL THEN note_globale END) as note_moyenne,
        COUNT(CASE WHEN YEAR(date_evaluation) = YEAR(GETDATE()) THEN 1 END) as annee_en_cours
      FROM Evaluations
    `);
    return result.recordset[0];
  }

  /**
   * Obtenir les évaluations par type
   */
  static async getByType(type) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('type', sql.VarChar, type)
      .query(`
        SELECT 
          e.*,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          p.type_personnel,
          CONCAT(ev.prenom, ' ', ev.nom) as evaluateur_nom
        FROM Evaluations e
        INNER JOIN Personnel p ON e.personnel_id = p.id
        LEFT JOIN Personnel ev ON e.evaluateur_id = ev.id
        WHERE e.type_evaluation = @type
        ORDER BY e.date_evaluation DESC
      `);
    return result.recordset;
  }

  /**
   * Obtenir les évaluations par année
   */
  static async getByYear(year) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('year', sql.Int, year)
      .query(`
        SELECT 
          e.*,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          p.type_personnel,
          CONCAT(ev.prenom, ' ', ev.nom) as evaluateur_nom
        FROM Evaluations e
        INNER JOIN Personnel p ON e.personnel_id = p.id
        LEFT JOIN Personnel ev ON e.evaluateur_id = ev.id
        WHERE YEAR(e.date_evaluation) = @year
        ORDER BY e.date_evaluation DESC
      `);
    return result.recordset;
  }

  /**
   * Vérifier si un personnel a été évalué récemment
   */
  static async hasRecentEvaluation(personnelId, mois = 6) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnel_id', sql.Int, personnelId)
      .input('mois', sql.Int, mois)
      .query(`
        SELECT COUNT(*) as count
        FROM Evaluations
        WHERE personnel_id = @personnel_id
        AND date_evaluation >= DATEADD(MONTH, -@mois, GETDATE())
      `);
    return result.recordset[0].count > 0;
  }
}

module.exports = Evaluation;