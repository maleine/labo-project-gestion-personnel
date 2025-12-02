// ==================== models/Habilitation.js (CORRIGÉ - COMPLET) ====================
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
      WHERE p.statut = 'Actif'
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
    
    try {
      console.log('Données reçues pour création habilitation:', data);
      
      // Convertir les chaînes vides en NULL
      const formationId = data.formation_id && data.formation_id !== '' ? parseInt(data.formation_id) : null;
      const validateurId = data.validateur_id && data.validateur_id !== '' ? parseInt(data.validateur_id) : null;
      const dateExpiration = data.date_expiration && data.date_expiration !== '' ? data.date_expiration : null;
      const niveau = data.niveau && data.niveau !== '' ? data.niveau : null;
      const codeHabilitation = data.code_habilitation && data.code_habilitation !== '' ? data.code_habilitation : null;
      
      const result = await pool.request()
        .input('personnel_id', sql.Int, parseInt(data.personnel_id))
        .input('type_habilitation', sql.VarChar(100), data.type_habilitation)
        .input('code_habilitation', sql.VarChar(50), codeHabilitation)
        .input('niveau', sql.VarChar(50), niveau)
        .input('date_obtention', sql.Date, data.date_obtention)
        .input('date_expiration', sql.Date, dateExpiration)
        .input('formation_id', sql.Int, formationId)
        .input('validateur_id', sql.Int, validateurId)
        .input('fichier_path', sql.VarChar(255), data.fichier_path || null)
        .input('notes', sql.Text, data.notes || null)
        .query(`
          INSERT INTO Habilitations (
            personnel_id, type_habilitation, code_habilitation, niveau,
            date_obtention, date_expiration, formation_id, validateur_id,
            fichier_path, notes, statut
          )
          VALUES (
            @personnel_id, @type_habilitation, @code_habilitation, @niveau,
            @date_obtention, @date_expiration, @formation_id, @validateur_id,
            @fichier_path, @notes, 'Active'
          );
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      console.log('Habilitation créée avec succès, ID:', result.recordset[0].id);
      return result.recordset[0].id;
    } catch (error) {
      console.error('Erreur création habilitation:', error);
      console.error('Détails erreur:', error.message);
      throw error;
    }
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

  static async update(id, data) {
    const pool = await getConnection();
    
    try {
      console.log('Mise à jour habilitation:', id, data);
      
      // Convertir les chaînes vides en NULL
      const dateExpiration = data.date_expiration && data.date_expiration !== '' ? data.date_expiration : null;
      const niveau = data.niveau && data.niveau !== '' ? data.niveau : null;
      const codeHabilitation = data.code_habilitation && data.code_habilitation !== '' ? data.code_habilitation : null;
      
      await pool.request()
        .input('id', sql.Int, id)
        .input('type_habilitation', sql.VarChar(100), data.type_habilitation)
        .input('code_habilitation', sql.VarChar(50), codeHabilitation)
        .input('niveau', sql.VarChar(50), niveau)
        .input('date_obtention', sql.Date, data.date_obtention)
        .input('date_expiration', sql.Date, dateExpiration)
        .input('notes', sql.Text, data.notes || null)
        .query(`
          UPDATE Habilitations 
          SET type_habilitation = @type_habilitation,
              code_habilitation = @code_habilitation,
              niveau = @niveau,
              date_obtention = @date_obtention,
              date_expiration = @date_expiration,
              notes = @notes
          WHERE id = @id
        `);
      
      console.log('Habilitation mise à jour avec succès');
    } catch (error) {
      console.error('Erreur mise à jour habilitation:', error);
      throw error;
    }
  }

  static async getById(id) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          h.*,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          p.type_personnel,
          f.titre as formation_titre
        FROM Habilitations h
        INNER JOIN Personnel p ON h.personnel_id = p.id
        LEFT JOIN Formations f ON h.formation_id = f.id
        WHERE h.id = @id
      `);
    return result.recordset[0];
  }
}

module.exports = Habilitation;