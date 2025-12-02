// ==================== utils/zktecoService.js ====================
const ZKLib = require('zkteco-js');
const { getConnection, sql } = require('../database/config');

class ZKTecoService {
  constructor(ip, port = 4370, timeout = 5000) {
    this.ip = ip;
    this.port = port;
    this.timeout = timeout;
    this.device = null;
    this.connected = false;
  }

  async connect() {
    try {
      this.device = new ZKLib(this.ip, this.port, this.timeout, this.timeout);
      await this.device.createSocket();
      this.connected = true;
      console.log(`✓ Connecté à la pointeuse ${this.ip}`);
      return true;
    } catch (error) {
      console.error(`✗ Erreur connexion pointeuse ${this.ip}:`, error.message);
      this.connected = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.connected && this.device) {
      try {
        await this.device.disconnect();
        this.connected = false;
        console.log(`✓ Déconnecté de ${this.ip}`);
      } catch (error) {
        if (error.code !== 'ERR_SOCKET_CLOSED') {
          console.error('Erreur déconnexion:', error.message);
        }
      }
    }
  }

  async getAttendances(startDate = null, endDate = null) {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const logs = await this.device.getAttendances();
      
      let filteredLogs = logs.data || [];

      // Filtrer par dates si spécifiées
      if (startDate || endDate) {
        filteredLogs = filteredLogs.filter(log => {
          const logDate = new Date(log.recordTime);
          if (startDate && logDate < new Date(startDate)) return false;
          if (endDate && logDate > new Date(endDate)) return false;
          return true;
        });
      }

      return filteredLogs;
    } catch (error) {
      console.error('Erreur récupération pointages:', error.message);
      throw error;
    }
  }

  async getUsers() {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const users = await this.device.getUsers();
      return users.data || [];
    } catch (error) {
      console.error('Erreur récupération utilisateurs:', error.message);
      throw error;
    }
  }

  async syncAttendances(appareilId, startDate = null) {
    const startTime = Date.now();
    let nbImportes = 0;
    let nbErreurs = 0;
    const erreurs = [];

    try {
      await this.connect();
      
      const logs = await this.getAttendances(startDate);
      const pool = await getConnection();

      for (const log of logs) {
        try {
          // Vérifier si existe déjà
          const existing = await pool.request()
            .input('appareil_id', sql.Int, appareilId)
            .input('user_id', sql.VarChar, log.deviceUserId)
            .input('date_heure', sql.DateTime, log.recordTime)
            .query(`
              SELECT id FROM PointagesBruts 
              WHERE appareil_id = @appareil_id 
                AND user_id = @user_id 
                AND date_heure = @date_heure
            `);

          if (existing.recordset.length === 0) {
            // Chercher mapping personnel
            const mapping = await pool.request()
              .input('user_id', sql.VarChar, log.deviceUserId)
              .input('appareil_id', sql.Int, appareilId)
              .query(`
                SELECT personnel_id FROM MappingPointeuse 
                WHERE user_id_pointeuse = @user_id 
                  AND (appareil_id = @appareil_id OR appareil_id IS NULL)
                  AND actif = 1
              `);

            const personnelId = mapping.recordset.length > 0 ? mapping.recordset[0].personnel_id : null;

            // Insérer pointage brut
            await pool.request()
              .input('appareil_id', sql.Int, appareilId)
              .input('user_id', sql.VarChar, log.deviceUserId)
              .input('personnel_id', sql.Int, personnelId)
              .input('date_heure', sql.DateTime, log.recordTime)
              .input('verification_mode', sql.Int, log.deviceUserId)
              .input('raw_data', sql.Text, JSON.stringify(log))
              .query(`
                INSERT INTO PointagesBruts 
                (appareil_id, user_id, personnel_id, date_heure, verification_mode, raw_data)
                VALUES (@appareil_id, @user_id, @personnel_id, @date_heure, @verification_mode, @raw_data)
              `);

            nbImportes++;

            // Calculer présence si personnel identifié
            if (personnelId) {
              const datePointage = new Date(log.recordTime).toISOString().split('T')[0];
              await pool.request()
                .input('personnel_id', sql.Int, personnelId)
                .input('date', sql.Date, datePointage)
                .execute('sp_CalculerPresenceJournaliere');
            }
          }
        } catch (error) {
          nbErreurs++;
          erreurs.push(`Erreur log ${log.deviceUserId}: ${error.message}`);
        }
      }

      // Log synchronisation
      const duree = Date.now() - startTime;
      await pool.request()
        .input('appareil_id', sql.Int, appareilId)
        .input('nb_importes', sql.Int, nbImportes)
        .input('nb_erreurs', sql.Int, nbErreurs)
        .input('duree', sql.Int, duree)
        .input('statut', sql.VarChar, nbErreurs === 0 ? 'Succès' : 'Partiel')
        .input('details', sql.Text, `Importé ${nbImportes} pointages en ${duree}ms`)
        .input('erreurs', sql.Text, erreurs.join('\n'))
        .query(`
          INSERT INTO LogsSynchroPointeuse 
          (appareil_id, nb_pointages_importes, nb_erreurs, duree_ms, statut, details, erreurs)
          VALUES (@appareil_id, @nb_importes, @nb_erreurs, @duree, @statut, @details, @erreurs)
        `);

      // Mettre à jour dernière synchro
      await pool.request()
        .input('id', sql.Int, appareilId)
        .query('UPDATE AppareilsPointage SET derniere_synchro = GETDATE() WHERE id = @id');

      return {
        success: true,
        nb_importes: nbImportes,
        nb_erreurs: nbErreurs,
        duree_ms: duree,
        erreurs: erreurs
      };

    } catch (error) {
      console.error('Erreur synchronisation:', error.message);
      
      const pool = await getConnection();
      await pool.request()
        .input('appareil_id', sql.Int, appareilId)
        .input('statut', sql.VarChar, 'Échec')
        .input('erreurs', sql.Text, error.message)
        .query(`
          INSERT INTO LogsSynchroPointeuse (appareil_id, statut, erreurs)
          VALUES (@appareil_id, @statut, @erreurs)
        `);

      throw error;
    } finally {
      await this.disconnect();
    }
  }

  // Fonction utilitaire: obtenir le lundi de la semaine
  static getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }
}

module.exports = ZKTecoService;
