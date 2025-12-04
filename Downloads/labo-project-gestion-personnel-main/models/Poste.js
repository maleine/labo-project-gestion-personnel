// ==================== models/Poste.js (CORRIGÉ) ====================
const { getConnection, sql } = require('../database/config');

class Poste {
  // Récupérer tous les postes avec calcul correct des places vacantes
  static async getAll() {
    const pool = await getConnection();
    
    // Utiliser la vue vw_PostesDisponibles qui calcule correctement les places
    const result = await pool.request().query(`
      SELECT 
        id, code, titre, departement_id, niveau, description,
        competences_requises, nb_postes_disponibles, statut,
        created_at, updated_at, departement_nom, responsable,
        postes_vacants,
        (nb_postes_disponibles - postes_vacants) as postes_occupes
      FROM vw_PostesDisponibles
      ORDER BY departement_nom, titre
    `);
    
    return result.recordset;
  }

  // Récupérer un poste par ID avec statistiques
  static async getById(id) {
    const pool = await getConnection();
    
    // Récupérer le poste
    const posteResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT p.*, d.nom as departement_nom
        FROM Postes p
        LEFT JOIN Departements d ON p.departement_id = d.id
        WHERE p.id = @id
      `);
    
    if (posteResult.recordset.length === 0) {
      return null;
    }
    
    const poste = posteResult.recordset[0];
    
    // Calculer les statistiques d'occupation
    const statsResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          COUNT(*) as postes_occupes
        FROM AffectationsPostes
        WHERE poste_id = @id AND statut = 'En cours'
      `);
    
    poste.postes_occupes = statsResult.recordset[0].postes_occupes;
    poste.postes_vacants = poste.nb_postes_disponibles - poste.postes_occupes;
    
    return poste;
  }

  // Créer un nouveau poste
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

  // Mettre à jour un poste
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

  // Récupérer les postes d'un département
  static async getByDepartement(departementId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('departement_id', sql.Int, departementId)
      .query(`
        SELECT * 
        FROM vw_PostesDisponibles 
        WHERE departement_id = @departement_id 
        AND statut = 'Actif' 
        ORDER BY titre
      `);
    return result.recordset;
  }

  // Affecter un personnel à un poste (avec transaction)
  static async affecterPersonnel(posteId, personnelId, dateDebut, notes = null) {
    const pool = await getConnection();
    const transaction = pool.transaction();
    
    try {
      await transaction.begin();
      
      // Vérifier disponibilité
      const checkResult = await transaction.request()
        .input('poste_id', sql.Int, posteId)
        .query(`
          SELECT 
            p.nb_postes_disponibles,
            COUNT(ap.id) as postes_occupes
          FROM Postes p
          LEFT JOIN AffectationsPostes ap ON p.id = ap.poste_id AND ap.statut = 'En cours'
          WHERE p.id = @poste_id
          GROUP BY p.nb_postes_disponibles
        `);
      
      const stats = checkResult.recordset[0];
      if (stats.postes_occupes >= stats.nb_postes_disponibles) {
        await transaction.rollback();
        throw new Error('Plus de places disponibles pour ce poste');
      }
      
      // Créer l'affectation
      const result = await transaction.request()
        .input('poste_id', sql.Int, posteId)
        .input('personnel_id', sql.Int, personnelId)
        .input('date_debut', sql.Date, dateDebut)
        .input('notes', sql.Text, notes)
        .query(`
          INSERT INTO AffectationsPostes (poste_id, personnel_id, date_debut, statut, notes)
          VALUES (@poste_id, @personnel_id, @date_debut, 'En cours', @notes);
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      await transaction.commit();
      return result.recordset[0].id;
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  // Vérifier si un code de poste existe déjà
  static async codeExists(code, excludeId = null) {
    const pool = await getConnection();
    let query = 'SELECT COUNT(*) as count FROM Postes WHERE code = @code';
    
    const request = pool.request().input('code', sql.VarChar, code);
    
    if (excludeId) {
      query += ' AND id != @excludeId';
      request.input('excludeId', sql.Int, excludeId);
    }
    
    const result = await request.query(query);
    return result.recordset[0].count > 0;
  }

  // Obtenir les statistiques des postes
  static async getStatistics() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        COUNT(*) as total_postes,
        SUM(nb_postes_disponibles) as total_places,
        SUM(nb_postes_disponibles - postes_vacants) as total_occupes,
        SUM(postes_vacants) as total_vacants,
        COUNT(CASE WHEN statut = 'Actif' THEN 1 END) as postes_actifs,
        COUNT(CASE WHEN statut = 'Inactif' THEN 1 END) as postes_inactifs
      FROM vw_PostesDisponibles
    `);
    return result.recordset[0];
  }

  // Rechercher des postes
  static async search(searchTerm) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('searchTerm', sql.VarChar, `%${searchTerm}%`)
      .query(`
        SELECT * 
        FROM vw_PostesDisponibles
        WHERE statut = 'Actif' 
        AND (
          code LIKE @searchTerm 
          OR titre LIKE @searchTerm 
          OR departement_nom LIKE @searchTerm
        )
        ORDER BY titre
      `);
    return result.recordset;
  }
}

module.exports = Poste;