// ==================== models/Poste.js ====================
const { getConnection, sql } = require('../database/config');

class Poste {
  static async getAll() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT * FROM vw_PostesDisponibles ORDER BY departement_nom, titre
    `);
    return result.recordset;
  }

  static async getById(id) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT p.*, d.nom as departement_nom
        FROM Postes p
        LEFT JOIN Departements d ON p.departement_id = d.id
        WHERE p.id = @id
      `);
    return result.recordset[0];
  }

  static async create(data) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('code', sql.VarChar, data.code)
      .input('titre', sql.VarChar, data.titre)
      .input('departement_id', sql.Int, data.departement_id)
      .input('niveau', sql.VarChar, data.niveau)
      .input('description', sql.Text, data.description || null)
      .input('competences_requises', sql.Text, data.competences_requises || null)
      .input('nb_postes_disponibles', sql.Int, data.nb_postes_disponibles || 1)
      .query(`
        INSERT INTO Postes (code, titre, departement_id, niveau, description, competences_requises, nb_postes_disponibles)
        VALUES (@code, @titre, @departement_id, @niveau, @description, @competences_requises, @nb_postes_disponibles);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    return result.recordset[0].id;
  }

  static async update(id, data) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .input('titre', sql.VarChar, data.titre)
      .input('niveau', sql.VarChar, data.niveau)
      .input('description', sql.Text, data.description || null)
      .input('competences_requises', sql.Text, data.competences_requises || null)
      .input('nb_postes_disponibles', sql.Int, data.nb_postes_disponibles || 1)
      .query(`
        UPDATE Postes 
        SET titre = @titre, niveau = @niveau, description = @description,
            competences_requises = @competences_requises, 
            nb_postes_disponibles = @nb_postes_disponibles,
            updated_at = GETDATE()
        WHERE id = @id
      `);
  }

  static async getByDepartement(departementId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('departement_id', sql.Int, departementId)
      .query('SELECT * FROM Postes WHERE departement_id = @departement_id AND statut = \'Actif\' ORDER BY titre');
    return result.recordset;
  }

  static async affecterPersonnel(posteId, personnelId, dateDebut) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('poste_id', sql.Int, posteId)
      .input('personnel_id', sql.Int, personnelId)
      .input('date_debut', sql.Date, dateDebut)
      .query(`
        INSERT INTO AffectationsPostes (poste_id, personnel_id, date_debut, statut)
        VALUES (@poste_id, @personnel_id, @date_debut, 'En cours');
        SELECT SCOPE_IDENTITY() AS id;
      `);
    return result.recordset[0].id;
  }
}

module.exports = Poste;
