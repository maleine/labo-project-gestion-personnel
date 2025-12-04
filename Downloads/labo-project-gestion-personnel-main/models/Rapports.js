// ==================== models/Rapport.js (Amélioré) ====================
const { getConnection, sql } = require('../database/config');

class Rapport {
  // Statistiques détaillées globales
  static async getDetailedStatistics() {
    try {
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
          SUM(CASE WHEN statut = 'Actif' THEN 1 ELSE 0 END) as actifs,
          SUM(CASE WHEN statut = 'Congé' THEN 1 ELSE 0 END) as en_conge,
          SUM(CASE WHEN statut = 'Inactif' THEN 1 ELSE 0 END) as inactifs
        FROM Personnel
      `);
      return result.recordset[0];
    } catch (err) {
      console.error('Erreur dans getDetailedStatistics:', err);
      throw err;
    }
  }

  // Statistiques par département - AMÉLIORÉ
  static async getStatsByDepartment() {
    try {
      const pool = await getConnection();
      
      // Stats Techniciens par département
      const techniciensResult = await pool.request().query(`
        SELECT 
          ISNULL(t.departement, 'Non affecté') as departement,
          COUNT(*) as nombre,
          SUM(CASE WHEN t.poste_nuit = 1 THEN 1 ELSE 0 END) as poste_nuit
        FROM Techniciens t
        INNER JOIN Personnel p ON t.personnel_id = p.id
        WHERE p.statut = 'Actif'
        GROUP BY t.departement
      `);

      // Stats Biologistes par spécialité
      const biologistesResult = await pool.request().query(`
        SELECT 
          ISNULL(b.specialite, 'Non spécifié') as departement,
          COUNT(*) as nombre,
          SUM(CASE WHEN b.responsable_assurance_qualite = 1 THEN 1 ELSE 0 END) as responsables_qualite
        FROM Biologistes b
        INNER JOIN Personnel p ON b.personnel_id = p.id
        WHERE p.statut = 'Actif'
        GROUP BY b.specialite
      `);

      // Stats Cadres par département
      const cadresResult = await pool.request().query(`
        SELECT 
          ISNULL(c.departement, 'Direction') as departement,
          COUNT(*) as nombre,
          c.poste
        FROM Cadres c
        INNER JOIN Personnel p ON c.personnel_id = p.id
        WHERE p.statut = 'Actif'
        GROUP BY c.departement, c.poste
      `);

      return {
        techniciens: techniciensResult.recordset,
        biologistes: biologistesResult.recordset,
        cadres: cadresResult.recordset
      };
    } catch (err) {
      console.error('Erreur dans getStatsByDepartment:', err);
      throw err;
    }
  }

  // Statistiques par type de personnel
  static async getStatsByType() {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(`
        SELECT 
          type_personnel,
          COUNT(*) as nombre,
          AVG(DATEDIFF(YEAR, date_embauche, GETDATE())) as anciennete_moyenne,
          MIN(date_embauche) as plus_ancien,
          MAX(date_embauche) as plus_recent
        FROM Personnel
        WHERE statut = 'Actif'
        GROUP BY type_personnel
        ORDER BY nombre DESC
      `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur dans getStatsByType:', err);
      throw err;
    }
  }

  // Évolution du personnel
  static async getEvolution(period = 'year') {
    try {
      const pool = await getConnection();
      
      let groupBy, dateFormat;
      switch (period) {
        case 'month':
          groupBy = 'YEAR(date_embauche), MONTH(date_embauche)';
          dateFormat = 'FORMAT(date_embauche, \'yyyy-MM\')';
          break;
        case 'quarter':
          groupBy = 'YEAR(date_embauche), DATEPART(QUARTER, date_embauche)';
          dateFormat = 'FORMAT(date_embauche, \'yyyy\') + \'-Q\' + CAST(DATEPART(QUARTER, date_embauche) AS VARCHAR)';
          break;
        default: // year
          groupBy = 'YEAR(date_embauche)';
          dateFormat = 'CAST(YEAR(date_embauche) AS VARCHAR)';
      }

      const result = await pool.request().query(`
        SELECT 
          ${dateFormat} as periode,
          COUNT(*) as nombre_embauches,
          type_personnel
        FROM Personnel
        GROUP BY ${groupBy}, type_personnel, ${dateFormat}
        ORDER BY periode
      `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur dans getEvolution:', err);
      throw err;
    }
  }

  // Analyse d'ancienneté - AMÉLIORÉ
  static async getAncienneteAnalysis() {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(`
        WITH AncienneteCategories AS (
          SELECT 
            CASE 
              WHEN DATEDIFF(YEAR, date_embauche, GETDATE()) < 1 THEN 'Moins d''un an'
              WHEN DATEDIFF(YEAR, date_embauche, GETDATE()) BETWEEN 1 AND 2 THEN '1-3 ans'
              WHEN DATEDIFF(YEAR, date_embauche, GETDATE()) BETWEEN 3 AND 4 THEN '3-5 ans'
              WHEN DATEDIFF(YEAR, date_embauche, GETDATE()) BETWEEN 5 AND 9 THEN '5-10 ans'
              ELSE 'Plus de 10 ans'
            END as tranche_anciennete,
            type_personnel,
            CASE 
              WHEN DATEDIFF(YEAR, date_embauche, GETDATE()) < 1 THEN 1
              WHEN DATEDIFF(YEAR, date_embauche, GETDATE()) BETWEEN 1 AND 2 THEN 2
              WHEN DATEDIFF(YEAR, date_embauche, GETDATE()) BETWEEN 3 AND 4 THEN 3
              WHEN DATEDIFF(YEAR, date_embauche, GETDATE()) BETWEEN 5 AND 9 THEN 4
              ELSE 5
            END as ordre
          FROM Personnel
          WHERE statut = 'Actif'
        )
        SELECT 
          tranche_anciennete,
          COUNT(*) as nombre,
          type_personnel
        FROM AncienneteCategories
        GROUP BY tranche_anciennete, type_personnel, ordre
        ORDER BY ordre
      `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur dans getAncienneteAnalysis:', err);
      throw err;
    }
  }

  // Répartition par genre - AMÉLIORÉ avec logique plus robuste
  static async getGenderDistribution() {
    try {
      const pool = await getConnection();
      
      const result = await pool.request().query(`
        SELECT 
          CASE 
            WHEN prenom LIKE '%a' OR prenom LIKE '%e' OR 
                 nom LIKE 'Mme%' OR nom LIKE 'Mlle%' OR
                 prenom IN ('Aminata', 'Fatou', 'Aissata', 'Mariama', 'Maleine', 'Awa') 
            THEN 'Femme'
            WHEN prenom LIKE '%ou' OR nom LIKE 'M.%' OR nom LIKE 'Mr%' OR
                 prenom IN ('Moussa', 'Ibrahima', 'Amadou', 'Bassirou')
            THEN 'Homme'
            ELSE 'Non spécifié'
          END as genre,
          COUNT(*) as nombre,
          type_personnel
        FROM Personnel
        WHERE statut = 'Actif'
        GROUP BY 
          CASE 
            WHEN prenom LIKE '%a' OR prenom LIKE '%e' OR 
                 nom LIKE 'Mme%' OR nom LIKE 'Mlle%' OR
                 prenom IN ('Aminata', 'Fatou', 'Aissata', 'Mariama', 'Maleine', 'Awa')
            THEN 'Femme'
            WHEN prenom LIKE '%ou' OR nom LIKE 'M.%' OR nom LIKE 'Mr%' OR
                 prenom IN ('Moussa', 'Ibrahima', 'Amadou', 'Bassirou')
            THEN 'Homme'
            ELSE 'Non spécifié'
          END,
          type_personnel
      `);
      return result.recordset;
    } catch (err) {
      console.error('Erreur dans getGenderDistribution:', err);
      // Retourner des données par défaut en cas d'erreur
      return [
        { genre: 'Homme', nombre: 0, type_personnel: 'Tous' },
        { genre: 'Femme', nombre: 0, type_personnel: 'Tous' }
      ];
    }
  }

  // Générer un rapport personnalisé
  static async generateCustomReport(type, filters = {}) {
    try {
      const pool = await getConnection();
      let query = 'SELECT * FROM Personnel WHERE 1=1';
      const request = pool.request();

      // Appliquer les filtres
      if (filters.departement) {
        query += ' AND EXISTS (SELECT 1 FROM Techniciens t WHERE t.personnel_id = Personnel.id AND t.departement = @departement)';
        request.input('departement', sql.VarChar, filters.departement);
      }

      if (filters.type_personnel) {
        query += ' AND type_personnel = @type_personnel';
        request.input('type_personnel', sql.VarChar, filters.type_personnel);
      }

      if (filters.statut) {
        query += ' AND statut = @statut';
        request.input('statut', sql.VarChar, filters.statut);
      }

      if (filters.date_debut) {
        query += ' AND date_embauche >= @date_debut';
        request.input('date_debut', sql.Date, filters.date_debut);
      }

      if (filters.date_fin) {
        query += ' AND date_embauche <= @date_fin';
        request.input('date_fin', sql.Date, filters.date_fin);
      }

      query += ' ORDER BY nom, prenom';

      const result = await request.query(query);
      return result.recordset;
    } catch (err) {
      console.error('Erreur dans generateCustomReport:', err);
      throw err;
    }
  }

  // Export vers Excel (placeholder)
  static async exportToExcel(type) {
    try {
      const data = await this.getDetailedStatistics();
      return JSON.stringify(data);
    } catch (err) {
      console.error('Erreur dans exportToExcel:', err);
      throw err;
    }
  }

  // Export vers PDF (placeholder)
  static async exportToPDF(type) {
    try {
      const data = await this.getDetailedStatistics();
      return JSON.stringify(data);
    } catch (err) {
      console.error('Erreur dans exportToPDF:', err);
      throw err;
    }
  }

  // Statistiques pour le tableau de bord
  static async getDashboardStatistics() {
    try {
      const pool = await getConnection();
      
      const mainStats = await pool.request().query(`
        SELECT 
          COUNT(*) as total_personnel,
          SUM(CASE WHEN statut = 'Actif' THEN 1 ELSE 0 END) as personnel_actif,
          SUM(CASE WHEN type_personnel = 'Biologiste' THEN 1 ELSE 0 END) as biologistes,
          SUM(CASE WHEN type_personnel = 'Technicien' THEN 1 ELSE 0 END) as techniciens,
          COUNT(DISTINCT CASE 
            WHEN type_personnel = 'Technicien' THEN (SELECT departement FROM Techniciens WHERE personnel_id = Personnel.id)
          END) as departements_actifs
        FROM Personnel
      `);

      const recentHires = await pool.request().query(`
        SELECT COUNT(*) as nouvelles_embauches
        FROM Personnel
        WHERE date_embauche >= DATEADD(DAY, -30, GETDATE())
      `);

      const activeTeams = await pool.request().query(`
        SELECT COUNT(*) as equipes_actives
        FROM Equipes
      `);

      return {
        ...mainStats.recordset[0],
        nouvelles_embauches: recentHires.recordset[0].nouvelles_embauches,
        equipes_actives: activeTeams.recordset[0].equipes_actives
      };
    } catch (err) {
      console.error('Erreur dans getDashboardStatistics:', err);
      throw err;
    }
  }
}

module.exports = Rapport;