// ==================== models/Equipe.js ====================
const { getConnection, sql } = require('../database/config');

class Equipe {
  // Récupérer toutes les équipes avec statistiques
  static async getAllWithStats() {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(`
        SELECT 
          e.id,
          e.nom,
          e.departement,
          e.responsable_id,
          e.description,
          e.created_at,
          CONCAT(p.prenom, ' ', p.nom) as responsable_nom,
          p.type_personnel as responsable_type,
          COUNT(me.personnel_id) as nombre_membres
        FROM Equipes e
        LEFT JOIN Personnel p ON e.responsable_id = p.id
        LEFT JOIN MembresEquipes me ON e.id = me.equipe_id
        GROUP BY 
          e.id, e.nom, e.departement, e.responsable_id, e.description, 
          e.created_at, p.prenom, p.nom, p.type_personnel
        ORDER BY e.nom
      `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur dans getAllWithStats:', err);
      throw err;
    }
  }

  // Récupérer les détails d'une équipe avec tous ses membres
  static async getDetailsWithMembers(equipeId) {
    try {
      const pool = await getConnection();
      
      // Récupérer les infos de l'équipe
      const equipeResult = await pool.request()
        .input('id', sql.Int, equipeId)
        .query(`
          SELECT 
            e.id,
            e.nom,
            e.departement,
            e.responsable_id,
            e.description,
            e.created_at,
            CONCAT(p.prenom, ' ', p.nom) as responsable_nom,
            p.email as responsable_email,
            p.type_personnel as responsable_type
          FROM Equipes e
          LEFT JOIN Personnel p ON e.responsable_id = p.id
          WHERE e.id = @id
        `);

      if (equipeResult.recordset.length === 0) {
        return null;
      }

      const equipe = equipeResult.recordset[0];

      // Récupérer les membres
      const membresResult = await pool.request()
        .input('equipe_id', sql.Int, equipeId)
        .query(`
          SELECT 
            p.id as personnel_id,
            p.matricule,
            CONCAT(p.prenom, ' ', p.nom) as nom_complet,
            p.email,
            p.telephone,
            p.type_personnel,
            me.date_integration
          FROM MembresEquipes me
          INNER JOIN Personnel p ON me.personnel_id = p.id
          WHERE me.equipe_id = @equipe_id
          ORDER BY me.date_integration DESC
        `);

      equipe.membres = membresResult.recordset;
      return equipe;
    } catch (err) {
      console.error('Erreur dans getDetailsWithMembers:', err);
      throw err;
    }
  }

  // Créer une équipe
  static async create(equipeData) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('nom', sql.VarChar, equipeData.nom)
        .input('departement', sql.VarChar, equipeData.departement)
        .input('responsable_id', sql.Int, equipeData.responsable_id)
        .input('description', sql.Text, equipeData.description || null)
        .query(`
          INSERT INTO Equipes (nom, departement, responsable_id, description)
          VALUES (@nom, @departement, @responsable_id, @description);
          SELECT SCOPE_IDENTITY() as id;
        `);
      return result.recordset[0].id;
    } catch (err) {
      console.error('Erreur dans create:', err);
      throw err;
    }
  }

  // Mettre à jour une équipe
  static async update(equipeId, equipeData) {
    try {
      const pool = await getConnection();
      await pool.request()
        .input('id', sql.Int, equipeId)
        .input('nom', sql.VarChar, equipeData.nom)
        .input('departement', sql.VarChar, equipeData.departement)
        .input('responsable_id', sql.Int, equipeData.responsable_id)
        .input('description', sql.Text, equipeData.description)
        .query(`
          UPDATE Equipes
          SET 
            nom = @nom,
            departement = @departement,
            responsable_id = @responsable_id,
            description = @description
          WHERE id = @id
        `);
      return true;
    } catch (err) {
      console.error('Erreur dans update:', err);
      throw err;
    }
  }

  // Supprimer une équipe
  static async delete(equipeId) {
    try {
      const pool = await getConnection();
      await pool.request()
        .input('id', sql.Int, equipeId)
        .query(`DELETE FROM Equipes WHERE id = @id`);
      return true;
    } catch (err) {
      console.error('Erreur dans delete:', err);
      throw err;
    }
  }

  // Ajouter un membre à une équipe
  static async addMember(equipeId, personnelId) {
    try {
      const pool = await getConnection();
      
      // Vérifier si le membre n'est pas déjà dans l'équipe
      const checkResult = await pool.request()
        .input('equipe_id', sql.Int, equipeId)
        .input('personnel_id', sql.Int, personnelId)
        .query(`
          SELECT COUNT(*) as count 
          FROM MembresEquipes 
          WHERE equipe_id = @equipe_id AND personnel_id = @personnel_id
        `);

      if (checkResult.recordset[0].count > 0) {
        throw new Error('Ce membre fait déjà partie de l\'équipe');
      }

      await pool.request()
        .input('equipe_id', sql.Int, equipeId)
        .input('personnel_id', sql.Int, personnelId)
        .query(`
          INSERT INTO MembresEquipes (equipe_id, personnel_id)
          VALUES (@equipe_id, @personnel_id)
        `);
      return true;
    } catch (err) {
      console.error('Erreur dans addMember:', err);
      throw err;
    }
  }

  // Retirer un membre d'une équipe
  static async removeMember(equipeId, personnelId) {
    try {
      const pool = await getConnection();
      await pool.request()
        .input('equipe_id', sql.Int, equipeId)
        .input('personnel_id', sql.Int, personnelId)
        .query(`
          DELETE FROM MembresEquipes 
          WHERE equipe_id = @equipe_id AND personnel_id = @personnel_id
        `);
      return true;
    } catch (err) {
      console.error('Erreur dans removeMember:', err);
      throw err;
    }
  }

  // Obtenir les statistiques globales des équipes
  static async getStatistics() {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(`
        SELECT 
          COUNT(DISTINCT e.id) as total_equipes,
          COUNT(DISTINCT me.personnel_id) as total_membres,
          COUNT(DISTINCT e.departement) as total_departements,
          AVG(CAST(membre_count.nombre as FLOAT)) as moyenne_membres
        FROM Equipes e
        LEFT JOIN MembresEquipes me ON e.id = me.equipe_id
        LEFT JOIN (
          SELECT equipe_id, COUNT(*) as nombre
          FROM MembresEquipes
          GROUP BY equipe_id
        ) membre_count ON e.id = membre_count.equipe_id
      `);
      return result.recordset[0];
    } catch (err) {
      console.error('Erreur dans getStatistics:', err);
      throw err;
    }
  }

  // Obtenir les équipes d'un département
  static async getByDepartment(departement) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('departement', sql.VarChar, departement)
        .query(`
          SELECT 
            e.id,
            e.nom,
            e.departement,
            CONCAT(p.prenom, ' ', p.nom) as responsable_nom,
            COUNT(me.personnel_id) as nombre_membres
          FROM Equipes e
          LEFT JOIN Personnel p ON e.responsable_id = p.id
          LEFT JOIN MembresEquipes me ON e.id = me.equipe_id
          WHERE e.departement = @departement
          GROUP BY e.id, e.nom, e.departement, p.prenom, p.nom
          ORDER BY e.nom
        `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur dans getByDepartment:', err);
      throw err;
    }
  }
}

module.exports = Equipe;