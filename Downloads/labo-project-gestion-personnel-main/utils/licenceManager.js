// ==========================================
// GESTIONNAIRE DE LICENCE - licenceManager.js
// ==========================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');
const axios = require('axios');

const LICENCE_FILE = path.join(process.env.APPDATA || process.env.HOME, 'bioclinic-licence.dat');
const ACTIVATION_SERVER = 'http://localhost:5000'; // Votre serveur d'activation

class LicenceManager {
  constructor() {
    this.machineId = machineIdSync();
    this.licence = null;
  }

  // Chiffrer les données de licence
  encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.machineId, 'salt', 32);
    const iv = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  // Déchiffrer les données de licence
  decrypt(encrypted) {
    try {
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(this.machineId, 'salt', 32);
      const iv = Buffer.alloc(16, 0);
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      return null;
    }
  }

  // Sauvegarder la licence localement
  saveLicenceLocally(licenceData) {
    try {
      const data = JSON.stringify(licenceData);
      const encrypted = this.encrypt(data);
      fs.writeFileSync(LICENCE_FILE, encrypted, 'utf8');
      console.log('✅ Licence sauvegardée localement');
      return true;
    } catch (err) {
      console.error('❌ Erreur sauvegarde licence:', err.message);
      return false;
    }
  }

  // Charger la licence locale
  loadLocalLicence() {
    try {
      if (!fs.existsSync(LICENCE_FILE)) {
        return null;
      }
      const encrypted = fs.readFileSync(LICENCE_FILE, 'utf8');
      const decrypted = this.decrypt(encrypted);
      if (!decrypted) return null;
      
      const licence = JSON.parse(decrypted);
      
      // Vérifier que la licence correspond à cette machine
      if (licence.machineId !== this.machineId) {
        console.error('❌ Licence invalide: ne correspond pas à cette machine');
        return null;
      }
      
      return licence;
    } catch (err) {
      console.error('❌ Erreur lecture licence:', err.message);
      return null;
    }
  }

  // Vérifier si la licence est valide
  isLicenceValid(licence) {
    if (!licence) return false;
    
    // Vérifier la date d'expiration
    const expiryDate = new Date(licence.expiresAt);
    const now = new Date();
    
    if (expiryDate < now) {
      console.log('⚠️  Licence expirée');
      return false;
    }
    
    // Vérifier le machineId
    if (licence.machineId !== this.machineId) {
      console.log('⚠️  Licence ne correspond pas à cette machine');
      return false;
    }
    
    return true;
  }

  // Activer une licence (en ligne)
  async activateLicenceOnline(licenceKey) {
    try {
      const response = await axios.post(
        `${ACTIVATION_SERVER}/api/activate`,
        {
          licenceKey: licenceKey.trim(),
          machineId: this.machineId
        },
        { timeout: 10000 }
      );

      console.log('📡 Réponse serveur:', response.data);

      if (response.data && response.data.success) {
        // Vérifier que response.data.licence existe
        if (!response.data.licence) {
          console.error('❌ Réponse serveur invalide: licence manquante');
          return { 
            success: false, 
            message: 'Erreur serveur: données de licence manquantes' 
          };
        }

        const licenceData = {
          licenceKey: licenceKey,
          machineId: this.machineId,
          activatedAt: response.data.licence.activatedAt || new Date().toISOString(),
          expiresAt: response.data.licence.expiresAt || new Date(Date.now() + 365*24*60*60*1000).toISOString(),
          status: 'activated'
        };
        
        // Sauvegarder localement
        this.saveLicenceLocally(licenceData);
        this.licence = licenceData;
        
        return { 
          success: true, 
          message: response.data.message || 'Licence activée avec succès!', 
          licence: licenceData 
        };
      } else {
        return { 
          success: false, 
          message: response.data?.message || 'Erreur inconnue lors de l\'activation' 
        };
      }
    } catch (err) {
      console.error('❌ Erreur activation en ligne:', err.message);
      if (err.response) {
        console.error('Réponse serveur:', err.response.data);
      }
      return { 
        success: false, 
        message: 'Impossible de contacter le serveur. Vérifiez votre connexion.' 
      };
    }
  }

  // Vérifier le statut en ligne
  async checkOnlineStatus() {
    try {
      const response = await axios.post(
        `${ACTIVATION_SERVER}/api/check-status`,
        { machineId: this.machineId },
        { timeout: 5000 }
      );

      if (response.data.activated && response.data.licence) {
        // Mettre à jour la licence locale
        const licenceData = {
          licenceKey: response.data.licence.licenceKey,
          machineId: this.machineId,
          activatedAt: response.data.licence.activatedAt,
          expiresAt: response.data.licence.expiresAt,
          status: response.data.licence.status
        };
        
        this.saveLicenceLocally(licenceData);
        return licenceData;
      }
      return null;
    } catch (err) {
      console.log('⚠️  Mode hors ligne - utilisation de la licence locale');
      return null;
    }
  }

  // Vérifier la licence (local d'abord, puis en ligne)
  async checkLicence() {
    // 1. Vérifier la licence locale
    const localLicence = this.loadLocalLicence();
    
    if (localLicence && this.isLicenceValid(localLicence)) {
      console.log('✅ Licence locale valide');
      this.licence = localLicence;
      
      // Essayer de synchroniser avec le serveur en arrière-plan
      this.checkOnlineStatus().catch(() => {});
      
      return { valid: true, licence: localLicence, mode: 'local' };
    }
    
    // 2. Si pas de licence locale valide, vérifier en ligne
    console.log('🔍 Vérification en ligne...');
    const onlineLicence = await this.checkOnlineStatus();
    
    if (onlineLicence && this.isLicenceValid(onlineLicence)) {
      console.log('✅ Licence en ligne valide');
      this.licence = onlineLicence;
      return { valid: true, licence: onlineLicence, mode: 'online' };
    }
    
    // 3. Aucune licence valide
    return { valid: false, licence: null };
  }

  // Obtenir les informations de licence
  getLicenceInfo() {
    if (!this.licence) return null;
    
    const expiryDate = new Date(this.licence.expiresAt);
    const now = new Date();
    const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    
    return {
      licenceKey: this.licence.licenceKey,
      machineId: this.licence.machineId,
      activatedAt: new Date(this.licence.activatedAt).toLocaleDateString('fr-FR'),
      expiresAt: new Date(this.licence.expiresAt).toLocaleDateString('fr-FR'),
      daysRemaining: daysRemaining,
      isValid: this.isLicenceValid(this.licence)
    };
  }

  // Supprimer la licence locale
  deleteLicence() {
    try {
      if (fs.existsSync(LICENCE_FILE)) {
        fs.unlinkSync(LICENCE_FILE);
        console.log('✅ Licence supprimée');
      }
      this.licence = null;
      return true;
    } catch (err) {
      console.error('❌ Erreur suppression licence:', err.message);
      return false;
    }
  }

  // Obtenir le Machine ID
  getMachineId() {
    return this.machineId;
  }
}

module.exports = new LicenceManager();