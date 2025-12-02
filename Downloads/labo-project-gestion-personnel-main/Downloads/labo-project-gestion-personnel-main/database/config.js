// ==================== database/config.js ====================
const sql = require('mssql');

const config = {
  user: 'sa',
  password: 'Pass*2018',
  server: 'localhost',
  database: 'LabPersonnel',
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

async function getConnection() {
  try {
    const pool = await sql.connect(config);
    return pool;
  } catch (err) {
    console.error('Erreur de connexion à la base de données:', err);
    throw err;
  }
}

// Script de création des tables
const createTablesScript = `
-- Table principale Personnel
CREATE TABLE Personnel (
  id INT PRIMARY KEY IDENTITY(1,1),
  matricule VARCHAR(50) UNIQUE NOT NULL,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  telephone VARCHAR(20),
  date_naissance DATE,
  date_embauche DATE NOT NULL,
  adresse TEXT,
  type_personnel VARCHAR(50) NOT NULL,
  statut VARCHAR(20) DEFAULT 'Actif',
  created_at DATETIME DEFAULT GETDATE(),
  updated_at DATETIME DEFAULT GETDATE()
);

-- Table Biologistes
CREATE TABLE Biologistes (
  id INT PRIMARY KEY IDENTITY(1,1),
  personnel_id INT FOREIGN KEY REFERENCES Personnel(id) ON DELETE CASCADE,
  specialite VARCHAR(100) NOT NULL,
  responsable_assurance_qualite BIT DEFAULT 0,
  created_at DATETIME DEFAULT GETDATE()
);

-- Table Spécialités Biologistes (relation many-to-many)
CREATE TABLE SpecialitesBiologistes (
  id INT PRIMARY KEY IDENTITY(1,1),
  biologiste_id INT FOREIGN KEY REFERENCES Biologistes(id) ON DELETE CASCADE,
  specialite VARCHAR(100) NOT NULL
);

-- Table Techniciens
CREATE TABLE Techniciens (
  id INT PRIMARY KEY IDENTITY(1,1),
  personnel_id INT FOREIGN KEY REFERENCES Personnel(id) ON DELETE CASCADE,
  departement VARCHAR(100) NOT NULL,
  poste_nuit BIT DEFAULT 0,
  created_at DATETIME DEFAULT GETDATE()
);

-- Table Cadres
CREATE TABLE Cadres (
  id INT PRIMARY KEY IDENTITY(1,1),
  personnel_id INT FOREIGN KEY REFERENCES Personnel(id) ON DELETE CASCADE,
  poste VARCHAR(100) NOT NULL,
  departement VARCHAR(100),
  created_at DATETIME DEFAULT GETDATE()
);

-- Table Responsabilités
CREATE TABLE Responsabilites (
  id INT PRIMARY KEY IDENTITY(1,1),
  personnel_id INT FOREIGN KEY REFERENCES Personnel(id) ON DELETE CASCADE,
  type_responsabilite VARCHAR(100) NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT GETDATE()
);

-- Table Équipes
CREATE TABLE Equipes (
  id INT PRIMARY KEY IDENTITY(1,1),
  nom VARCHAR(100) NOT NULL,
  departement VARCHAR(100) NOT NULL,
  responsable_id INT FOREIGN KEY REFERENCES Personnel(id),
  created_at DATETIME DEFAULT GETDATE()
);

-- Table Membres Équipes
CREATE TABLE MembresEquipes (
  id INT PRIMARY KEY IDENTITY(1,1),
  equipe_id INT FOREIGN KEY REFERENCES Equipes(id) ON DELETE CASCADE,
  personnel_id INT FOREIGN KEY REFERENCES Personnel(id) ON DELETE CASCADE,
  date_integration DATE DEFAULT GETDATE()
);
`;

module.exports = { getConnection, sql, createTablesScript };