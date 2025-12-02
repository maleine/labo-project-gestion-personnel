// ==================== models/Personnel.js (MISE À JOUR) ====================
const { getConnection, sql } = require('../database/config');

class Personnel {
  // Récupérer tout le personnel actif
  static async getAll() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT p.*, d.nom as departement_nom, d.code as departement_code
      FROM Personnel p
      LEFT JOIN Departements d ON p.departement_id = d.id
      WHERE p.statut = 'Actif' 
      ORDER BY p.type_personnel, p.nom, p.prenom
    `);
    return result.recordset;
  }

  // Récupérer un personnel par ID
  static async getById(id) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT p.*, d.nom as departement_nom, d.code as departement_code
        FROM Personnel p
        LEFT JOIN Departements d ON p.departement_id = d.id
        WHERE p.id = @id
      `);
    return result.recordset[0];
  }

  // Récupérer le dernier matricule par type
  static async getLastMatriculeByType(typePersonnel) {
    const pool = await getConnection();
    
    const prefixes = {
      'Biologiste': 'BIO',
      'Technicien': 'TECH',
      'Cadre': 'CAD',
      'Secrétaire': 'SEC',
      'Préleveur': 'PREL',
      'Agent Logistique': 'LOG'
    };

    const prefix = prefixes[typePersonnel];
    if (!prefix) {
      throw new Error('Type de personnel invalide');
    }

    const result = await pool.request()
      .input('prefix', sql.VarChar, prefix + '%')
      .query(`
        SELECT TOP 1 matricule 
        FROM Personnel 
        WHERE matricule LIKE @prefix 
        ORDER BY matricule DESC
      `);

    if (result.recordset.length === 0) {
      return prefix + '001';
    }

    const lastMatricule = result.recordset[0].matricule;
    const lastNumber = parseInt(lastMatricule.replace(prefix, ''));
    const newNumber = lastNumber + 1;
    return prefix + String(newNumber).padStart(3, '0');
  }

  // Créer un nouveau personnel
  static async create(data) {
    const pool = await getConnection();
    
    // Générer le matricule si non fourni
    let matricule = data.matricule;
    if (!matricule) {
      matricule = await this.getLastMatriculeByType(data.type_personnel);
    }

    const result = await pool.request()
      .input('matricule', sql.VarChar, matricule)
      .input('nom', sql.VarChar, data.nom)
      .input('prenom', sql.VarChar, data.prenom)
      .input('email', sql.VarChar, data.email)
      .input('telephone', sql.VarChar, data.telephone || null)
      .input('date_naissance', sql.Date, data.date_naissance || null)
      .input('date_embauche', sql.Date, data.date_embauche)
      .input('adresse', sql.Text, data.adresse || null)
      .input('type_personnel', sql.VarChar, data.type_personnel)
      .input('departement_id', sql.Int, data.departement_id || null)
      .query(`
        INSERT INTO Personnel (
          matricule, nom, prenom, email, telephone, 
          date_naissance, date_embauche, adresse, type_personnel, departement_id
        )
        VALUES (
          @matricule, @nom, @prenom, @email, @telephone, 
          @date_naissance, @date_embauche, @adresse, @type_personnel, @departement_id
        );
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    return result.recordset[0].id;
  }

  // Mettre à jour un personnel
  static async update(id, data) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .input('nom', sql.VarChar, data.nom)
      .input('prenom', sql.VarChar, data.prenom)
      .input('email', sql.VarChar, data.email)
      .input('telephone', sql.VarChar, data.telephone || null)
      .input('adresse', sql.Text, data.adresse || null)
      .input('date_naissance', sql.Date, data.date_naissance || null)
      .input('departement_id', sql.Int, data.departement_id || null)
      .query(`
        UPDATE Personnel 
        SET 
          nom = @nom, 
          prenom = @prenom, 
          email = @email, 
          telephone = @telephone, 
          adresse = @adresse,
          date_naissance = @date_naissance,
          departement_id = @departement_id,
          updated_at = GETDATE()
        WHERE id = @id
      `);
  }

  // Supprimer (désactiver) un personnel
  static async delete(id) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE Personnel SET statut = \'Inactif\', updated_at = GETDATE() WHERE id = @id');
  }

  // Récupérer le personnel par type
  static async getByType(type) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('type', sql.VarChar, type)
      .query(`
        SELECT p.*, d.nom as departement_nom
        FROM Personnel p
        LEFT JOIN Departements d ON p.departement_id = d.id
        WHERE p.type_personnel = @type AND p.statut = 'Actif' 
        ORDER BY p.nom, p.prenom
      `);
    return result.recordset;
  }

  // Récupérer le personnel d'un département
  static async getByDepartment(departementId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('departement_id', sql.Int, departementId)
      .query(`
        SELECT * FROM Personnel
        WHERE departement_id = @departement_id AND statut = 'Actif'
        ORDER BY nom, prenom
      `);
    return result.recordset;
  }

  // Vérifier si un matricule existe déjà
  static async matriculeExists(matricule) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('matricule', sql.VarChar, matricule)
      .query('SELECT COUNT(*) as count FROM Personnel WHERE matricule = @matricule');
    return result.recordset[0].count > 0;
  }

  // Vérifier si un email existe déjà
  static async emailExists(email, excludeId = null) {
    const pool = await getConnection();
    let query = 'SELECT COUNT(*) as count FROM Personnel WHERE email = @email';
    
    const request = pool.request().input('email', sql.VarChar, email);
    
    if (excludeId) {
      query += ' AND id != @excludeId';
      request.input('excludeId', sql.Int, excludeId);
    }
    
    const result = await request.query(query);
    return result.recordset[0].count > 0;
  }

  // Obtenir les statistiques du personnel
  static async getStatistics() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN type_personnel = 'Biologiste' THEN 1 ELSE 0 END) as biologistes,
        SUM(CASE WHEN type_personnel = 'Technicien' THEN 1 ELSE 0 END) as techniciens,
        SUM(CASE WHEN type_personnel = 'Cadre' THEN 1 ELSE 0 END) as cadres,
        SUM(CASE WHEN type_personnel = 'Secrétaire' THEN 1 ELSE 0 END) as secretaires,
        SUM(CASE WHEN type_personnel = 'Préleveur' THEN 1 ELSE 0 END) as preleveurs,
        SUM(CASE WHEN type_personnel = 'Agent Logistique' THEN 1 ELSE 0 END) as agents_logistiques,
        SUM(CASE WHEN DATEDIFF(year, date_embauche, GETDATE()) < 1 THEN 1 ELSE 0 END) as nouveaux_employes
      FROM Personnel 
      WHERE statut = 'Actif'
    `);
    return result.recordset[0];
  }

  // Rechercher du personnel
  static async search(searchTerm) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('searchTerm', sql.VarChar, `%${searchTerm}%`)
      .query(`
        SELECT p.*, d.nom as departement_nom
        FROM Personnel p
        LEFT JOIN Departements d ON p.departement_id = d.id
        WHERE p.statut = 'Actif' 
        AND (
          p.matricule LIKE @searchTerm 
          OR p.nom LIKE @searchTerm 
          OR p.prenom LIKE @searchTerm 
          OR p.email LIKE @searchTerm
          OR CONCAT(p.prenom, ' ', p.nom) LIKE @searchTerm
        )
        ORDER BY p.nom, p.prenom
      `);
    return result.recordset;
  }

  // Obtenir les anniversaires du mois en cours
  static async getBirthdays() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        id, matricule, prenom, nom, email, 
        date_naissance, type_personnel,
        DAY(date_naissance) as jour,
        MONTH(date_naissance) as mois
      FROM Personnel 
      WHERE statut = 'Actif' 
      AND MONTH(date_naissance) = MONTH(GETDATE())
      ORDER BY DAY(date_naissance)
    `);
    return result.recordset;
  }

  // Obtenir les anciennetés
  static async getAnciennetes() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        id, matricule, prenom, nom, email, 
        date_embauche, type_personnel,
        DATEDIFF(year, date_embauche, GETDATE()) as anciennete_annees
      FROM Personnel 
      WHERE statut = 'Actif'
      ORDER BY date_embauche
    `);
    return result.recordset;
  }
}

module.exports = Personnel;