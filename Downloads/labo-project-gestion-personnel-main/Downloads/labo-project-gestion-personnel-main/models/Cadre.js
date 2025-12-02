// ==================== models/Cadre.js ====================
const { getConnection, sql } = require('../database/config');

class Cadre {
  static async create(personnelId, data) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnel_id', sql.Int, personnelId)
      .input('poste', sql.VarChar, data.poste)
      .input('departement', sql.VarChar, data.departement || null)
      .query(`
        INSERT INTO Cadres (personnel_id, poste, departement)
        VALUES (@personnel_id, @poste, @departement);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    return result.recordset[0].id;
  }

  static async getByPersonnelId(personnelId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnel_id', sql.Int, personnelId)
      .query('SELECT * FROM Cadres WHERE personnel_id = @personnel_id');
    return result.recordset[0];
  }

  static async getAll() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT p.*, c.poste, c.departement
      FROM Personnel p
      INNER JOIN Cadres c ON p.id = c.personnel_id
      WHERE p.statut = 'Actif'
      ORDER BY p.nom, p.prenom
    `);
    return result.recordset;
  }

  static async getByPoste(poste) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('poste', sql.VarChar, poste)
      .query(`
        SELECT p.*, c.poste, c.departement
        FROM Personnel p
        INNER JOIN Cadres c ON p.id = c.personnel_id
        WHERE c.poste LIKE '%' + @poste + '%' AND p.statut = 'Actif'
        ORDER BY p.nom, p.prenom
      `);
    return result.recordset;
  }

  static async update(personnelId, data) {
    const pool = await getConnection();
    await pool.request()
      .input('personnel_id', sql.Int, personnelId)
      .input('poste', sql.VarChar, data.poste)
      .input('departement', sql.VarChar, data.departement || null)
      .query(`
        UPDATE Cadres 
        SET poste = @poste, 
            departement = @departement
        WHERE personnel_id = @personnel_id
      `);
  }

  static async getResponsables() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT p.*, c.poste, c.departement
      FROM Personnel p
      INNER JOIN Cadres c ON p.id = c.personnel_id
      WHERE (c.poste LIKE '%Responsable%' OR c.poste LIKE '%Chef%' OR c.poste LIKE '%Directeur%')
        AND p.statut = 'Actif'
      ORDER BY p.nom, p.prenom
    `);
    return result.recordset;
  }
}

module.exports = Cadre;