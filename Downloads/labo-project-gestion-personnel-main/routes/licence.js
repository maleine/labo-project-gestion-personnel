// ==========================================
// ROUTES LICENCE - routes/licence.js
// ==========================================
const express = require('express');
const router = express.Router();
const licenceManager = require('../utils/licenceManager');

// Page d'activation de licence
router.get('/activate', (req, res) => {
  const machineId = licenceManager.getMachineId();
  const info = licenceManager.getLicenceInfo();
  
  res.render('licence/activate', {
    title: 'Activation de Licence',
    machineId: machineId,
    licenceInfo: info,
    message: null,
    currentPage: 'licence'
  });
});

// Activer une nouvelle licence
router.post('/activate', async (req, res) => {
  const { licenceKey } = req.body;
  
  if (!licenceKey || licenceKey.trim() === '') {
    return res.render('licence/activate', {
      title: 'Activation de Licence',
      machineId: licenceManager.getMachineId(),
      licenceInfo: null,
      message: { type: 'danger', text: 'Veuillez entrer une clé de licence' },
      currentPage: 'licence'
    });
  }
  
  const result = await licenceManager.activateLicenceOnline(licenceKey);
  
  if (result.success) {
    return res.redirect('/dashboard');
  } else {
    return res.render('licence/activate', {
      title: 'Activation de Licence',
      machineId: licenceManager.getMachineId(),
      licenceInfo: null,
      message: { type: 'danger', text: result.message },
      currentPage: 'licence'
    });
  }
});

// Vérifier le statut de la licence
router.get('/status', async (req, res) => {
  const status = await licenceManager.checkLicence();
  const info = licenceManager.getLicenceInfo();
  
  res.render('licence/status', {
    title: 'Statut de la Licence',
    machineId: licenceManager.getMachineId(),
    licenceInfo: info,
    status: status,
    currentPage: 'licence'
  });
});

// Renouveler la vérification
router.post('/refresh', async (req, res) => {
  await licenceManager.checkLicence();
  res.redirect('/licence/status');
});

// Supprimer la licence
router.post('/delete', (req, res) => {
  licenceManager.deleteLicence();
  res.redirect('/licence/activate');
});

module.exports = router;