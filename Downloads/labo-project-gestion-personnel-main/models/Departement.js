// ==================== models/Departement.js (CORRIGÉ) ====================
const { getConnection, sql } = require('../database/config');

class Departement {
  static async getAll() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT d.*, 
             CONCAT(p.prenom, ' ', p.nom) as responsable_nom,
             COUNT(DISTINCT pe.id) as nb_personnel
      FROM Departements d
      LEFT JOIN Personnel p ON d.responsable_id = p.id
      LEFT JOIN Personnel pe ON d.id = pe.departement_id AND pe.statut = 'Actif'
      WHERE d.statut = 'Actif'
      GROUP BY d.id, d.code, d.nom, d.description, d.responsable_id, d.statut, 
               d.created_at, d.updated_at, p.prenom, p.nom
      ORDER BY d.nom
    `);
    return result.recordset;
  }

  static async getById(id) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT d.*, 
               CONCAT(p.prenom, ' ', p.nom) as responsable_nom,
               COUNT(DISTINCT pe.id) as nb_personnel
        FROM Departements d
        LEFT JOIN Personnel p ON d.responsable_id = p.id
        LEFT JOIN Personnel pe ON d.id = pe.departement_id AND pe.statut = 'Actif'
        WHERE d.id = @id
        GROUP BY d.id, d.code, d.nom, d.description, d.responsable_id, d.statut, 
                 d.created_at, d.updated_at, p.prenom, p.nom
      `);
    return result.recordset[0];
  }

  static async create(data) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('code', sql.VarChar, data.code)
      .input('nom', sql.VarChar, data.nom)
      .input('description', sql.VarChar(sql.MAX), data.description || null)
      .input('responsable_id', sql.Int, data.responsable_id || null)
      .query(`
        INSERT INTO Departements (code, nom, description, responsable_id)
        VALUES (@code, @nom, @description, @responsable_id);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    return result.recordset[0].id;
  }

  static async update(id, data) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .input('nom', sql.VarChar, data.nom)
      .input('description', sql.VarChar(sql.MAX), data.description || null)
      .input('responsable_id', sql.Int, data.responsable_id || null)
      .query(`
        UPDATE Departements 
        SET nom = @nom, description = @description, responsable_id = @responsable_id,
            updated_at = GETDATE()
        WHERE id = @id
      `);
  }

  static async delete(id) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE Departements SET statut = \'Inactif\' WHERE id = @id');
  }

  // Obtenir les statistiques d'un département
  static async getStatistics(id) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          COUNT(*) as total_personnel,
          SUM(CASE WHEN type_personnel = 'Biologiste' THEN 1 ELSE 0 END) as biologistes,
          SUM(CASE WHEN type_personnel = 'Technicien' THEN 1 ELSE 0 END) as techniciens,
          SUM(CASE WHEN type_personnel = 'Cadre' THEN 1 ELSE 0 END) as cadres
        FROM Personnel
        WHERE departement_id = @id AND statut = 'Actif'
      `);
    return result.recordset[0];
  }
}

module.exports = Departement;