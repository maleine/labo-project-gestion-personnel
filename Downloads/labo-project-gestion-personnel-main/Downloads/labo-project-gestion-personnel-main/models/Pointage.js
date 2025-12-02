// ==================== models/Pointage.js ====================
const { getConnection, sql } = require('../database/config');

class Pointage {
  // Pointer l'arrivée
  static async pointerArrivee(personnelId) {
    const pool = await getConnection();
    
    // Vérifier s'il y a déjà un pointage aujourd'hui
    const checkResult = await pool.request()
      .input('personnelId', sql.Int, personnelId)
      .query(`
        SELECT * FROM Pointages 
        WHERE personnel_id = @personnelId 
        AND CAST(date_pointage AS DATE) = CAST(GETDATE() AS DATE)
      `);
    
    if (checkResult.recordset.length > 0) {
      throw new Error('Vous avez déjà pointé votre arrivée aujourd\'hui');
    }
    
    const result = await pool.request()
      .input('personnelId', sql.Int, personnelId)
      .query(`
        INSERT INTO Pointages (personnel_id, heure_arrivee, date_pointage)
        VALUES (@personnelId, GETDATE(), GETDATE());
        SELECT SCOPE_IDENTITY() AS id;
      `);
    
    return result.recordset[0].id;
  }

  // Pointer le départ
  static async pointerDepart(personnelId) {
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('personnelId', sql.Int, personnelId)
      .query(`
        UPDATE Pointages 
        SET heure_depart = GETDATE(),
            duree_travail = DATEDIFF(MINUTE, heure_arrivee, GETDATE())
        WHERE personnel_id = @personnelId 
        AND CAST(date_pointage AS DATE) = CAST(GETDATE() AS DATE)
        AND heure_depart IS NULL;
        
        SELECT @@ROWCOUNT AS affected;
      `);
    
    if (result.recordset[0].affected === 0) {
      throw new Error('Aucun pointage d\'arrivée trouvé pour aujourd\'hui');
    }
    
    return true;
  }

  // Obtenir le pointage du jour pour un personnel
  static async getPointageDuJour(personnelId) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnelId', sql.Int, personnelId)
      .query(`
        SELECT * FROM Pointages 
        WHERE personnel_id = @personnelId 
        AND CAST(date_pointage AS DATE) = CAST(GETDATE() AS DATE)
      `);
    
    return result.recordset[0];
  }

  // Obtenir l'historique des pointages d'un personnel
  static async getHistoriqueByPersonnel(personnelId, dateDebut, dateFin) {
    const pool = await getConnection();
    
    let query = `
      SELECT p.*, 
             CASE 
               WHEN heure_depart IS NULL THEN 'En cours'
               ELSE 'Terminé'
             END as statut
      FROM Pointages p
      WHERE personnel_id = @personnelId
    `;
    
    const request = pool.request().input('personnelId', sql.Int, personnelId);
    
    if (dateDebut) {
      query += ' AND date_pointage >= @dateDebut';
      request.input('dateDebut', sql.Date, dateDebut);
    }
    
    if (dateFin) {
      query += ' AND date_pointage <= @dateFin';
      request.input('dateFin', sql.Date, dateFin);
    }
    
    query += ' ORDER BY date_pointage DESC, heure_arrivee DESC';
    
    const result = await request.query(query);
    return result.recordset;
  }

  // Obtenir tous les pointages du jour
  static async getPointagesDuJour() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT p.*, 
             per.matricule, per.nom, per.prenom, per.type_personnel,
             CASE 
               WHEN p.heure_depart IS NULL THEN 'Présent'
               ELSE 'Parti'
             END as statut,
             CASE 
               WHEN DATEPART(HOUR, p.heure_arrivee) > 8 THEN 'Retard'
               ELSE 'À l\'heure'
             END as ponctualite
      FROM Pointages p
      INNER JOIN Personnel per ON p.personnel_id = per.id
      WHERE CAST(p.date_pointage AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY p.heure_arrivee ASC
    `);
    
    return result.recordset;
  }

  // Obtenir les statistiques de présence
  static async getStatistiques(dateDebut, dateFin) {
    const pool = await getConnection();
    
    const request = pool.request();
    let query = `
      SELECT 
        COUNT(DISTINCT personnel_id) as personnel_present,
        COUNT(*) as total_pointages,
        AVG(CAST(duree_travail AS FLOAT)) as duree_moyenne,
        SUM(CASE WHEN DATEPART(HOUR, heure_arrivee) > 8 THEN 1 ELSE 0 END) as retards,
        SUM(CASE WHEN duree_travail < 420 THEN 1 ELSE 0 END) as departs_anticipes
      FROM Pointages
      WHERE 1=1
    `;
    
    if (dateDebut) {
      query += ' AND date_pointage >= @dateDebut';
      request.input('dateDebut', sql.Date, dateDebut);
    }
    
    if (dateFin) {
      query += ' AND date_pointage <= @dateFin';
      request.input('dateFin', sql.Date, dateFin);
    }
    
    const result = await request.query(query);
    return result.recordset[0];
  }

  // Obtenir le rapport mensuel d'un personnel
  static async getRapportMensuel(personnelId, mois, annee) {
    const pool = await getConnection();
    const result = await pool.request()
      .input('personnelId', sql.Int, personnelId)
      .input('mois', sql.Int, mois)
      .input('annee', sql.Int, annee)
      .query(`
        SELECT 
          COUNT(*) as jours_travailles,
          SUM(duree_travail) as total_minutes,
          AVG(CAST(duree_travail AS FLOAT)) as moyenne_minutes,
          SUM(CASE WHEN DATEPART(HOUR, heure_arrivee) > 8 THEN 1 ELSE 0 END) as retards,
          SUM(CASE WHEN duree_travail < 420 THEN 1 ELSE 0 END) as departs_anticipes
        FROM Pointages
        WHERE personnel_id = @personnelId
        AND MONTH(date_pointage) = @mois
        AND YEAR(date_pointage) = @annee
      `);
    
    return result.recordset[0];
  }

  // Vérifier les absences (personnel qui n'ont pas pointé)
  static async getAbsences() {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT p.id, p.matricule, p.nom, p.prenom, p.type_personnel, p.email
      FROM Personnel p
      WHERE p.statut = 'Actif'
      AND NOT EXISTS (
        SELECT 1 FROM Pointages pt
        WHERE pt.personnel_id = p.id
        AND CAST(pt.date_pointage AS DATE) = CAST(GETDATE() AS DATE)
      )
      ORDER BY p.type_personnel, p.nom, p.prenom
    `);
    
    return result.recordset;
  }

  // Corriger un pointage (admin seulement)
  static async corriger(pointageId, heureArrivee, heureDepart) {
    const pool = await getConnection();
    
    let dureeMinutes = null;
    if (heureArrivee && heureDepart) {
      const arrival = new Date(heureArrivee);
      const departure = new Date(heureDepart);
      dureeMinutes = Math.floor((departure - arrival) / 60000);
    }
    
    await pool.request()
      .input('pointageId', sql.Int, pointageId)
      .input('heureArrivee', sql.DateTime, heureArrivee)
      .input('heureDepart', sql.DateTime, heureDepart || null)
      .input('duree', sql.Int, dureeMinutes)
      .query(`
        UPDATE Pointages 
        SET heure_arrivee = @heureArrivee,
            heure_depart = @heureDepart,
            duree_travail = @duree
        WHERE id = @pointageId
      `);
  }
}

module.exports = Pointage;