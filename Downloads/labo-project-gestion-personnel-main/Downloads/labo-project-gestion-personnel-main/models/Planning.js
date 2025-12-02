// ==================== models/Planning.js ====================
const { getConnection, sql } = require('../database/config');

class Planning {
  static async creer(data) {
    const pool = await getConnection();
    const reference = 'PLAN-' + Date.now();
    
    const result = await pool.request()
      .input('reference', sql.VarChar, reference)
      .input('titre', sql.VarChar, data.titre)
      .input('type_planning', sql.VarChar, data.type_planning)
      .input('departement_id', sql.Int, data.departement_id || null)
      .input('date_debut', sql.Date, data.date_debut)
      .input('date_fin', sql.Date, data.date_fin)
      .input('description', sql.VarChar(sql.MAX), data.description || null)
      .input('createur_id', sql.Int, data.createur_id)
      .query(`
        INSERT INTO Plannings (reference, titre, type_planning, departement_id, date_debut, date_fin, description, createur_id)
        VALUES (@reference, @titre, @type_planning, @departement_id, @date_debut, @date_fin, @description, @createur_id);
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    return result.recordset[0].id;
  }

  static async getAll(type = null) {
    const pool = await getConnection();
    const request = pool.request();
    
    let query = `
      SELECT 
        pl.*,
        d.nom as departement_nom,
        CONCAT(c.prenom, ' ', c.nom) as createur_nom,
        COUNT(DISTINCT ap.personnel_id) as nb_affectations
      FROM Plannings pl
      LEFT JOIN Departements d ON pl.departement_id = d.id
      LEFT JOIN Personnel c ON pl.createur_id = c.id
      LEFT JOIN AffectationsPlanning ap ON pl.id = ap.planning_id
      WHERE 1=1
    `;
    
    if (type) {
      query += ` AND pl.type_planning = @type`;
      request.input('type', sql.VarChar, type);
    }
    
    query += ` GROUP BY pl.id, pl.reference, pl.titre, pl.type_planning, pl.departement_id, 
               pl.date_debut, pl.date_fin, pl.description, pl.createur_id, pl.statut, 
               pl.validateur_id, pl.date_validation, pl.created_at, pl.updated_at,
               d.nom, c.prenom, c.nom
               ORDER BY pl.date_debut DESC`;
    
    const result = await request.query(query);
    return result.recordset;
  }

  static async getById(id) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          pl.*,
          d.nom as departement_nom,
          CONCAT(c.prenom, ' ', c.nom) as createur_nom
        FROM Plannings pl
        LEFT JOIN Departements d ON pl.departement_id = d.id
        LEFT JOIN Personnel c ON pl.createur_id = c.id
        WHERE pl.id = @id
      `);
    return result.recordset[0];
  }

  static async ajouterAffectation(planningId, data) {
    const pool = await getConnection();

    console.log("Affectation reçue :", data);

    // Fonction pour normaliser et convertir les heures
    const parseTimeToDate = (timeStr) => {
      if (!timeStr) return null;
      
      const trimmed = timeStr.trim();
      
      // Si vide ou valeurs nulles
      if (trimmed === "" || trimmed === "null" || trimmed === "undefined") {
        return null;
      }

      // Extraire les composantes de l'heure
      let hours, minutes, seconds;
      
      // Format HH:mm ou HH:mm:ss
      const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      
      if (timeMatch) {
        hours = parseInt(timeMatch[1]);
        minutes = parseInt(timeMatch[2]);
        seconds = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
        
        // Validation des valeurs
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
          console.log("Heure hors limites détectée, convertie en NULL :", trimmed);
          return null;
        }
        
        // Créer un objet Date pour SQL Server Time
        return new Date(1970, 0, 1, hours, minutes, seconds);
      }

      console.log("Format d'heure invalide détecté, converti en NULL :", trimmed);
      return null;
    };

    const heure_debut = parseTimeToDate(data.heure_debut);
    const heure_fin = parseTimeToDate(data.heure_fin);

    console.log("Heures converties :", { heure_debut, heure_fin });

    // Construction dynamique de la requête
    const request = pool.request()
      .input('planning_id', sql.Int, planningId)
      .input('personnel_id', sql.Int, data.personnel_id)
      .input('date', sql.Date, data.date);

    let colonnes = ['planning_id', 'personnel_id', 'date'];
    let valeurs = ['@planning_id', '@personnel_id', '@date'];

    if (heure_debut !== null) {
      request.input('heure_debut', sql.Time, heure_debut);
      colonnes.push('heure_debut');
      valeurs.push('@heure_debut');
    }

    if (heure_fin !== null) {
      request.input('heure_fin', sql.Time, heure_fin);
      colonnes.push('heure_fin');
      valeurs.push('@heure_fin');
    }

    if (data.poste && data.poste.trim() !== '') {
      request.input('poste', sql.VarChar(100), data.poste.trim());
      colonnes.push('poste');
      valeurs.push('@poste');
    }

    if (data.commentaire && data.commentaire.trim() !== '') {
      request.input('commentaire', sql.NVarChar(sql.MAX), data.commentaire.trim());
      colonnes.push('commentaire');
      valeurs.push('@commentaire');
    }

    const query = `
      INSERT INTO AffectationsPlanning (${colonnes.join(', ')})
      VALUES (${valeurs.join(', ')});
      SELECT SCOPE_IDENTITY() AS id;
    `;

    console.log("Requête SQL :", query);

    const result = await request.query(query);

    return result.recordset[0].id;
  }

  static async getAffectations(planningId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('planning_id', sql.Int, planningId)
      .query(`
        SELECT 
          ap.*,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          p.telephone,
          p.email
        FROM AffectationsPlanning ap
        INNER JOIN Personnel p ON ap.personnel_id = p.id
        WHERE ap.planning_id = @planning_id
        ORDER BY ap.date, ap.heure_debut
      `);
    return result.recordset;
  }

  static async getGardeNuitSemaine() {
    const pool = await getConnection();
    
    const result = await pool.request()
      .query(`
        SELECT 
          ap.*,
          pl.titre as planning_titre,
          pl.type_planning,
          CONCAT(p.prenom, ' ', p.nom) as personnel_nom,
          p.telephone,
          p.email,
          po.titre as poste_nom
        FROM AffectationsPlanning ap
        INNER JOIN Plannings pl ON ap.planning_id = pl.id
        INNER JOIN Personnel p ON ap.personnel_id = p.id
        LEFT JOIN Postes po ON ap.poste = po.titre
        WHERE pl.type_planning = 'Garde de nuit'
          AND ap.date >= CAST(GETDATE() AS DATE)
          AND ap.date <= DATEADD(DAY, 7, CAST(GETDATE() AS DATE))
          AND pl.statut = 'Publié'
        ORDER BY ap.date, ap.heure_debut
      `);
    return result.recordset;
  }

  static async getCompteursPersonnel(personnelId, annee = new Date().getFullYear()) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnel_id', sql.Int, personnelId)
      .input('annee', sql.Int, annee)
      .query(`
        SELECT * FROM CompteursPlanning 
        WHERE personnel_id = @personnel_id AND annee = @annee
      `);
    return result.recordset[0];
  }

  static async publier(id, validateurId) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .input('validateur_id', sql.Int, validateurId)
      .query(`
        UPDATE Plannings 
        SET statut = 'Publié',
            validateur_id = @validateur_id,
            date_validation = GETDATE()
        WHERE id = @id
      `);
  }

  static async update(id, data) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .input('titre', sql.VarChar, data.titre)
      .input('date_debut', sql.Date, data.date_debut)
      .input('date_fin', sql.Date, data.date_fin)
      .input('description', sql.VarChar(sql.MAX), data.description || null)
      .query(`
        UPDATE Plannings 
        SET titre = @titre,
            date_debut = @date_debut,
            date_fin = @date_fin,
            description = @description,
            updated_at = GETDATE()
        WHERE id = @id
      `);
  }

  static async delete(id) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE Plannings SET statut = \'Annulé\' WHERE id = @id');
  }

  static async supprimerAffectation(affectationId) {
    const pool = await getConnection();
    await pool.request()
      .input('id', sql.Int, affectationId)
      .query('DELETE FROM AffectationsPlanning WHERE id = @id');
  }
}

module.exports = Planning;