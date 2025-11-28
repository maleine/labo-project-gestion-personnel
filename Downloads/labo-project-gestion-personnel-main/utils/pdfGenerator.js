// ==================== utils/pdfGenerator.js ====================
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFGenerator {
  constructor() {
    this.doc = null;
    this.logoPath = path.join(__dirname, '../public/images/logo.png');
  }

  // Créer un nouveau document
  createDocument(title, options = {}) {
    this.doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: title,
        Author: 'Lab Personnel Manager',
        Subject: options.subject || title,
        Keywords: options.keywords || 'laboratoire, personnel, rh'
      }
    });
    
    return this.doc;
  }

  // En-tête standard
  addHeader(titre, sousTitre = '') {
    // Logo (si disponible)
    try {
      if (fs.existsSync(this.logoPath)) {
        this.doc.image(this.logoPath, 50, 45, { width: 100 });
      }
    } catch (err) {
      console.log('Logo non trouvé');
    }

    // Titre
    this.doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(titre, 200, 57, { align: 'right' });

    if (sousTitre) {
      this.doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#666')
        .text(sousTitre, 200, 80, { align: 'right' });
    }

    // Ligne de séparation
    this.doc
      .moveTo(50, 120)
      .lineTo(545, 120)
      .strokeColor('#3498db')
      .lineWidth(2)
      .stroke();

    this.doc.moveDown(3);
    this.doc.fillColor('#000');
  }

  // Pied de page
  addFooter(pageNumber, totalPages) {
    this.doc
      .fontSize(8)
      .fillColor('#999')
      .text(
        `Page ${pageNumber} / ${totalPages} | Généré le ${new Date().toLocaleString('fr-FR')} | Lab Personnel Manager`,
        50,
        this.doc.page.height - 50,
        { align: 'center' }
      );
  }

  // Tableau simple
  addTable(headers, rows, options = {}) {
    const tableTop = this.doc.y;
    const columnWidth = (545 - 100) / headers.length;

    // En-têtes
    this.doc.font('Helvetica-Bold').fontSize(10);
    headers.forEach((header, i) => {
      this.doc.text(
        header,
        50 + (i * columnWidth),
        tableTop,
        { width: columnWidth, align: 'left' }
      );
    });

    // Ligne sous en-têtes
    this.doc
      .moveTo(50, tableTop + 15)
      .lineTo(545, tableTop + 15)
      .stroke();

    // Données
    this.doc.font('Helvetica').fontSize(9);
    let currentY = tableTop + 25;

    rows.forEach((row, rowIndex) => {
      if (currentY > 700) {
        this.doc.addPage();
        currentY = 50;
      }

      row.forEach((cell, i) => {
        this.doc.text(
          cell || '',
          50 + (i * columnWidth),
          currentY,
          { width: columnWidth - 10, align: 'left' }
        );
      });

      currentY += 25;
    });

    this.doc.moveDown(2);
  }

  // Section avec titre
  addSection(title, content) {
    this.doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#2c3e50')
      .text(title);

    this.doc
      .moveDown(0.5)
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#000')
      .text(content);

    this.doc.moveDown(1);
  }

  // Statistiques en encadrés
  addStatBox(label, value, x, y, color = '#3498db') {
    this.doc
      .rect(x, y, 120, 60)
      .fillAndStroke(color, '#000');

    this.doc
      .fillColor('#fff')
      .fontSize(24)
      .font('Helvetica-Bold')
      .text(value, x, y + 10, { width: 120, align: 'center' });

    this.doc
      .fontSize(10)
      .font('Helvetica')
      .text(label, x, y + 40, { width: 120, align: 'center' });

    this.doc.fillColor('#000');
  }

  // Finaliser et sauvegarder
  finalize(outputPath) {
    return new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(outputPath);
      
      stream.on('finish', () => {
        resolve(outputPath);
      });

      stream.on('error', (err) => {
        reject(err);
      });

      this.doc.pipe(stream);
      this.doc.end();
    });
  }
}

module.exports = PDFGenerator;