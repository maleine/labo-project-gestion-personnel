// ==================== models/Technicien.js ====================
const { getConnection, sql } = require('../database/config');

class Technicien {
  static async create(personnelId, data) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnel_id', sql.Int, personnelId)
      .input('departement', sql.VarChar, data.departement)
      .input('poste_nuit', sql.Bit, data.poste_nuit ? 1 : 0)
      .query(`
        INSERT INTO Techniciens (personnel_id, departement, poste_nuit)
        VALUES (@personnel_id, @departement, @poste_nuit);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    return result.recordset[0].id;
  }

  static async getByPersonnelId(personnelId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnel_id', sql.Int, personnelId)
      .query('SELECT * FROM Techniciens WHERE personnel_id = @personnel_id');
    return result.recordset[0];
  }

  static async getAll() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT p.*, t.departement, t.poste_nuit
      FROM Personnel p
      INNER JOIN Techniciens t ON p.id = t.personnel_id
      WHERE p.statut = 'Actif'
      ORDER BY p.nom, p.prenom
    `);
    return result.recordset;
  }

  static async getByDepartement(departement) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('departement', sql.VarChar, departement)
      .query(`
        SELECT p.*, t.departement, t.poste_nuit
        FROM Personnel p
        INNER JOIN Techniciens t ON p.id = t.personnel_id
        WHERE t.departement = @departement AND p.statut = 'Actif'
        ORDER BY p.nom, p.prenom
      `);
    return result.recordset;
  }

  static async getGardeNuit() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT p.*, t.departement
      FROM Personnel p
      INNER JOIN Techniciens t ON p.id = t.personnel_id
      WHERE t.poste_nuit = 1 AND p.statut = 'Actif'
      ORDER BY p.nom, p.prenom
    `);
    return result.recordset;
  }

  static async update(personnelId, data) {
    const pool = await getConnection();
    await pool.request()
      .input('personnel_id', sql.Int, personnelId)
      .input('departement', sql.VarChar, data.departement)
      .input('poste_nuit', sql.Bit, data.poste_nuit ? 1 : 0)
      .query(`
        UPDATE Techniciens 
        SET departement = @departement, 
            poste_nuit = @poste_nuit
        WHERE personnel_id = @personnel_id
      `);
  }

  static async getStatsByDepartement() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        t.departement,
        COUNT(*) as total,
        SUM(CASE WHEN t.poste_nuit = 1 THEN 1 ELSE 0 END) as garde_nuit
      FROM Techniciens t
      INNER JOIN Personnel p ON t.personnel_id = p.id
      WHERE p.statut = 'Actif'
      GROUP BY t.departement
    `);
    return result.recordset;
  }
}

module.exports = Technicien;
