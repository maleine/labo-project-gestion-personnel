// ==================== models/Competence.js ====================
const { getConnection } = require('../database/config');
const sql = require('mssql');

class Competence {
  /**
   * Récupérer toutes les compétences
   */
  static async getAll() {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(`
        SELECT 
          id, code, nom, categorie, description, created_at
        FROM Competences
        ORDER BY categorie, nom
      `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur getAll Competences:', err);
      throw err;
    }
  }

  /**
   * Récupérer une compétence par ID
   */
  static async getById(id) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT 
            id, code, nom, categorie, description, created_at
          FROM Competences
          WHERE id = @id
        `);
      return result.recordset[0];
    } catch (err) {
      console.error('Erreur getById Competence:', err);
      throw err;
    }
  }

  /**
   * Récupérer les compétences par catégorie
   */
  static async getByCategorie(categorie) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('categorie', sql.NVarChar, categorie)
        .query(`
          SELECT 
            id, code, nom, categorie, description, created_at
          FROM Competences
          WHERE categorie = @categorie
          ORDER BY nom
        `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur getByCategorie:', err);
      throw err;
    }
  }

  /**
   * Récupérer les compétences d'un personnel
   */
  static async getByPersonnel(personnelId) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('personnelId', sql.Int, personnelId)
        .query(`
          SELECT 
            c.id, c.code, c.nom, c.categorie, c.description,
            cp.id as competence_personnel_id,
            cp.niveau, cp.date_acquisition, cp.date_evaluation,
            cp.notes,
            e.nom as evaluateur_nom, e.prenom as evaluateur_prenom
          FROM Competences c
          INNER JOIN CompetencesPersonnel cp ON c.id = cp.competence_id
          LEFT JOIN Personnel e ON cp.evaluateur_id = e.id
          WHERE cp.personnel_id = @personnelId
          ORDER BY c.categorie, c.nom
        `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur getByPersonnel:', err);
      throw err;
    }
  }

  /**
   * Récupérer les compétences requises pour un poste
   */
  static async getByPoste(posteId) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('posteId', sql.Int, posteId)
        .query(`
          SELECT 
            c.id, c.code, c.nom, c.categorie, c.description,
            cpo.niveau_requis
          FROM Competences c
          INNER JOIN CompetencesPostes cpo ON c.id = cpo.competence_id
          WHERE cpo.poste_id = @posteId
          ORDER BY c.categorie, c.nom
        `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur getByPoste:', err);
      throw err;
    }
  }

  /**
   * Créer une nouvelle compétence
   */
  static async create(data) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('code', sql.NVarChar, data.code)
        .input('nom', sql.NVarChar, data.nom)
        .input('categorie', sql.NVarChar, data.categorie)
        .input('description', sql.NVarChar, data.description || null)
        .query(`
          INSERT INTO Competences (code, nom, categorie, description)
          OUTPUT INSERTED.id
          VALUES (@code, @nom, @categorie, @description)
        `);
      return result.recordset[0];
    } catch (err) {
      console.error('Erreur create Competence:', err);
      throw err;
    }
  }

  /**
   * Mettre à jour une compétence
   */
  static async update(id, data) {
    try {
      const pool = await getConnection();
      await pool.request()
        .input('id', sql.Int, id)
        .input('code', sql.NVarChar, data.code)
        .input('nom', sql.NVarChar, data.nom)
        .input('categorie', sql.NVarChar, data.categorie)
        .input('description', sql.NVarChar, data.description || null)
        .query(`
          UPDATE Competences
          SET code = @code,
              nom = @nom,
              categorie = @categorie,
              description = @description
          WHERE id = @id
        `);
      return true;
    } catch (err) {
      console.error('Erreur update Competence:', err);
      throw err;
    }
  }

  /**
   * Supprimer une compétence
   */
  static async delete(id) {
    try {
      const pool = await getConnection();
      await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM Competences WHERE id = @id');
      return true;
    } catch (err) {
      console.error('Erreur delete Competence:', err);
      throw err;
    }
  }

  /**
   * Affecter une compétence à un personnel
   */
  static async affecterPersonnel(data) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('personnelId', sql.Int, data.personnel_id)
        .input('competenceId', sql.Int, data.competence_id)
        .input('niveau', sql.NVarChar, data.niveau)
        .input('dateAcquisition', sql.Date, data.date_acquisition || null)
        .input('dateEvaluation', sql.Date, data.date_evaluation || null)
        .input('evaluateurId', sql.Int, data.evaluateur_id || null)
        .input('notes', sql.NVarChar, data.notes || null)
        .query(`
          INSERT INTO CompetencesPersonnel 
          (personnel_id, competence_id, niveau, date_acquisition, date_evaluation, evaluateur_id, notes)
          OUTPUT INSERTED.id
          VALUES (@personnelId, @competenceId, @niveau, @dateAcquisition, @dateEvaluation, @evaluateurId, @notes)
        `);
      return result.recordset[0];
    } catch (err) {
      console.error('Erreur affecterPersonnel:', err);
      throw err;
    }
  }

  /**
   * Mettre à jour une compétence personnel
   */
  static async updateCompetencePersonnel(id, data) {
    try {
      const pool = await getConnection();
      await pool.request()
        .input('id', sql.Int, id)
        .input('niveau', sql.NVarChar, data.niveau)
        .input('dateEvaluation', sql.Date, data.date_evaluation || null)
        .input('evaluateurId', sql.Int, data.evaluateur_id || null)
        .input('notes', sql.NVarChar, data.notes || null)
        .query(`
          UPDATE CompetencesPersonnel
          SET niveau = @niveau,
              date_evaluation = @dateEvaluation,
              evaluateur_id = @evaluateurId,
              notes = @notes
          WHERE id = @id
        `);
      return true;
    } catch (err) {
      console.error('Erreur updateCompetencePersonnel:', err);
      throw err;
    }
  }

  /**
   * Affecter une compétence à un poste
   */
  static async affecterPoste(data) {
    try {
      const pool = await getConnection();
      const result = await pool.request()
        .input('posteId', sql.Int, data.poste_id)
        .input('competenceId', sql.Int, data.competence_id)
        .input('niveauRequis', sql.NVarChar, data.niveau_requis)
        .query(`
          INSERT INTO CompetencesPostes (poste_id, competence_id, niveau_requis)
          OUTPUT INSERTED.id
          VALUES (@posteId, @competenceId, @niveauRequis)
        `);
      return result.recordset[0];
    } catch (err) {
      console.error('Erreur affecterPoste:', err);
      throw err;
    }
  }

  /**
   * Récupérer les catégories de compétences
   */
  static async getCategories() {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(`
        SELECT DISTINCT categorie
        FROM Competences
        ORDER BY categorie
      `);
      return result.recordset.map(r => r.categorie);
    } catch (err) {
      console.error('Erreur getCategories:', err);
      throw err;
    }
  }

  /**
   * Statistiques des compétences
   */
  static async getStatistiques() {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(`
        SELECT 
          COUNT(DISTINCT c.id) as total_competences,
          COUNT(DISTINCT cp.personnel_id) as personnel_avec_competences,
          COUNT(DISTINCT c.categorie) as total_categories,
          AVG(CASE 
            WHEN cp.niveau = 'Expert' THEN 4
            WHEN cp.niveau = 'Confirmé' THEN 3
            WHEN cp.niveau = 'Intermédiaire' THEN 2
            WHEN cp.niveau = 'Débutant' THEN 1
            ELSE 0
          END) as niveau_moyen
        FROM Competences c
        LEFT JOIN CompetencesPersonnel cp ON c.id = cp.competence_id
      `);
      return result.recordset[0];
    } catch (err) {
      console.error('Erreur getStatistiques:', err);
      throw err;
    }
  }
}

module.exports = Competence;