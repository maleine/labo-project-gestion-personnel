// ==================== models/User.js ====================
const { getConnection, sql } = require('../database/config');
const bcrypt = require('bcrypt');

class User {
  // Créer un utilisateur
  static async create(data) {
    const pool = await getConnection();
    
    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(data.password, 10);
    
    const result = await pool.request()
      .input('personnel_id', sql.Int, data.personnel_id)
      .input('username', sql.VarChar, data.username)
      .input('password', sql.VarChar, hashedPassword)
      .input('role', sql.VarChar, data.role || 'user')
      .query(`
        INSERT INTO Users (personnel_id, username, password, role)
        VALUES (@personnel_id, @username, @password, @role);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    return result.recordset[0].id;
  }

  // Trouver un utilisateur par username
  static async findByUsername(username) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .query(`
        SELECT u.*, p.nom, p.prenom, p.email, p.type_personnel, p.matricule
        FROM Users u
        INNER JOIN Personnel p ON u.personnel_id = p.id
        WHERE u.username = @username AND u.statut = 'Actif'
      `);
    
    return result.recordset[0];
  }

  // Trouver un utilisateur par ID
  static async findById(id) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT u.*, p.nom, p.prenom, p.email, p.type_personnel, p.matricule
        FROM Users u
        INNER JOIN Personnel p ON u.personnel_id = p.id
        WHERE u.id = @id
      `);
    
    return result.recordset[0];
  }

  // Vérifier le mot de passe
  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Vérifier si un username existe
  static async usernameExists(username) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .query('SELECT COUNT(*) as count FROM Users WHERE username = @username');
    
    return result.recordset[0].count > 0;
  }

  // Mettre à jour la dernière connexion
  static async updateLastLogin(userId) {
    const pool = await getConnection();
    await pool.request()
      .input('userId', sql.Int, userId)
      .query('UPDATE Users SET last_login = GETDATE() WHERE id = @userId');
  }

  // Changer le mot de passe
  static async changePassword(userId, newPassword) {
    const pool = await getConnection();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('password', sql.VarChar, hashedPassword)
      .query('UPDATE Users SET password = @password WHERE id = @userId');
  }

  // Obtenir tous les utilisateurs
  static async getAll() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT u.id, u.username, u.role, u.statut, u.last_login, u.created_at,
             p.matricule, p.nom, p.prenom, p.email, p.type_personnel
      FROM Users u
      INNER JOIN Personnel p ON u.personnel_id = p.id
      ORDER BY p.nom, p.prenom
    `);
    
    return result.recordset;
  }

  // Désactiver un utilisateur
  static async deactivate(userId) {
    const pool = await getConnection();
    await pool.request()
      .input('userId', sql.Int, userId)
      .query("UPDATE Users SET statut = 'Inactif' WHERE id = @userId");
  }
}

module.exports = User;