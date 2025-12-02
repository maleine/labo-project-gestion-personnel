// ==================== public/js/app.js ====================

// Global App Object
const LabApp = {
    // API endpoints
    api: {
        personnel: '/personnel',
        statistics: '/personnel/api/statistics'
    },
    
    // Initialize the application
    init() {
        this.setupEventListeners();
        this.loadStatistics();
        this.setupTooltips();
    },
    
    // Setup global event listeners
    setupEventListeners() {
        // Confirm before leaving page with unsaved changes
        let formChanged = false;
        
        document.querySelectorAll('form input, form select, form textarea').forEach(element => {
            element.addEventListener('change', () => {
                formChanged = true;
            });
        });
        
        document.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', () => {
                formChanged = false;
            });
        });
        
        window.addEventListener('beforeunload', (e) => {
            if (formChanged) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
        
        // Auto-hide alerts
        setTimeout(() => {
            document.querySelectorAll('.alert').forEach(alert => {
                alert.style.transition = 'opacity 0.5s';
                alert.style.opacity = '0';
                setTimeout(() => alert.remove(), 500);
            });
        }, 5000);
    },
    
    // Setup Bootstrap tooltips
    setupTooltips() {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    },
    
    // Load statistics for dashboard
    async loadStatistics() {
        try {
            const response = await fetch(this.api.statistics);
            const data = await response.json();
            
            if (document.getElementById('stat-total')) {
                this.updateStatistics(data);
            }
        } catch (error) {
            console.error('Erreur lors du chargement des statistiques:', error);
        }
    },
    
    // Update statistics display
    updateStatistics(data) {
        const stats = {
            'stat-total': data.total,
            'stat-biologistes': data.biologistes,
            'stat-techniciens': data.techniciens,
            'stat-cadres': data.cadres
        };
        
        Object.keys(stats).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                this.animateNumber(element, stats[id]);
            }
        });
    },
    
    // Animate number counting
    animateNumber(element, target) {
        const duration = 1000;
        const start = 0;
        const increment = target / (duration / 16);
        let current = start;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                element.textContent = target;
                clearInterval(timer);
            } else {
                element.textContent = Math.floor(current);
            }
        }, 16);
    },
    
    // Show loading spinner
    showLoading() {
        const spinner = document.createElement('div');
        spinner.className = 'spinner-overlay';
        spinner.id = 'loading-spinner';
        spinner.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Chargement...</span></div>';
        document.body.appendChild(spinner);
    },
    
    // Hide loading spinner
    hideLoading() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) {
            spinner.remove();
        }
    },
    
    // Show notification
    showNotification(message, type = 'success') {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
        alert.style.zIndex = '9999';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.appendChild(alert);
        
        setTimeout(() => {
            alert.style.opacity = '0';
            setTimeout(() => alert.remove(), 300);
        }, 5000);
    },
    
    // Format date to French format
    formatDate(dateString) {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(date);
    },
    
    // Format phone number
    formatPhone(phone) {
        if (!phone) return '';
        return phone.replace(/(\d{2})(?=\d)/g, '$1 ');
    },
    
    // Validate email
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    // Validate phone
    validatePhone(phone) {
        const re = /^[\d\s+()-]{10,}$/;
        return re.test(phone);
    },
    
    // Export table to CSV
    exportTableToCSV(tableId, filename = 'export.csv') {
        const table = document.getElementById(tableId);
        if (!table) return;
        
        let csv = [];
        const rows = table.querySelectorAll('tr');
        
        rows.forEach(row => {
            const cols = row.querySelectorAll('td, th');
            const csvRow = [];
            cols.forEach(col => {
                csvRow.push('"' + col.textContent.trim().replace(/"/g, '""') + '"');
            });
            csv.push(csvRow.join(','));
        });
        
        const csvString = csv.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },
    
    // Print section
    printSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (!section) return;
        
        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write('<html><head><title>Impression</title>');
        printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">');
        printWindow.document.write('</head><body>');
        printWindow.document.write(section.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.print();
    }
};

// Personnel Management Functions
const PersonnelManager = {
    // View personnel details
    async viewDetails(id) {
        try {
            LabApp.showLoading();
            const response = await fetch(`/personnel/details/${id}`);
            const data = await response.json();
            
            // Create modal
            const modal = this.createDetailsModal(data);
            document.body.appendChild(modal);
            
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
            
            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });
            
            LabApp.hideLoading();
        } catch (error) {
            LabApp.hideLoading();
            LabApp.showNotification('Erreur lors du chargement des détails', 'danger');
        }
    },
    
    // Create details modal
    createDetailsModal(data) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">Détails - ${data.prenom} ${data.nom}</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <p><strong>Matricule:</strong> ${data.matricule}</p>
                                <p><strong>Email:</strong> ${data.email}</p>
                                <p><strong>Téléphone:</strong> ${data.telephone || 'Non renseigné'}</p>
                                <p><strong>Type:</strong> <span class="badge bg-info">${data.type_personnel}</span></p>
                            </div>
                            <div class="col-md-6">
                                <p><strong>Date Naissance:</strong> ${data.date_naissance ? LabApp.formatDate(data.date_naissance) : 'Non renseignée'}</p>
                                <p><strong>Date Embauche:</strong> ${LabApp.formatDate(data.date_embauche)}</p>
                                <p><strong>Statut:</strong> <span class="badge ${data.statut === 'Actif' ? 'bg-success' : 'bg-secondary'}">${data.statut}</span></p>
                            </div>
                        </div>
                        ${this.getSpecificDetails(data)}
                    </div>
                    <div class="modal-footer">
                        <a href="/personnel/edit/${data.id}" class="btn btn-warning">
                            <i class="bi bi-pencil"></i> Modifier
                        </a>
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fermer</button>
                    </div>
                </div>
            </div>
        `;
        return modal;
    },
    
    // Get specific details based on personnel type
    getSpecificDetails(data) {
        let html = '<hr>';
        
        if (data.biologiste) {
            html += `
                <h6 class="text-primary">Informations Biologiste</h6>
                <p><strong>Spécialité:</strong> ${data.biologiste.specialite}</p>
                <p><strong>Responsable Assurance Qualité:</strong> ${data.biologiste.responsable_assurance_qualite ? 'Oui' : 'Non'}</p>
            `;
        } else if (data.technicien) {
            html += `
                <h6 class="text-success">Informations Technicien</h6>
                <p><strong>Département:</strong> ${data.technicien.departement}</p>
                <p><strong>Garde de Nuit:</strong> ${data.technicien.poste_nuit ? 'Oui' : 'Non'}</p>
            `;
        } else if (data.cadre) {
            html += `
                <h6 class="text-info">Informations Cadre</h6>
                <p><strong>Poste:</strong> ${data.cadre.poste}</p>
                <p><strong>Département:</strong> ${data.cadre.departement || 'Non renseigné'}</p>
            `;
        }
        
        return html;
    },
    
    // Delete personnel with confirmation
    async deletePersonnel(id, name) {
        if (!confirm(`Êtes-vous sûr de vouloir supprimer ${name}? Cette action est irréversible.`)) {
            return;
        }
        
        try {
            LabApp.showLoading();
            const response = await fetch(`/personnel/delete/${id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                LabApp.showNotification('Personnel supprimé avec succès', 'success');
                setTimeout(() => location.reload(), 1000);
            } else {
                throw new Error('Erreur lors de la suppression');
            }
        } catch (error) {
            LabApp.showNotification('Erreur lors de la suppression', 'danger');
        } finally {
            LabApp.hideLoading();
        }
    }
};

// Form Validation
const FormValidator = {
    // Validate personnel form
    validatePersonnelForm(form) {
        let isValid = true;
        const errors = [];
        
        // Validate required fields
        const requiredFields = form.querySelectorAll('[required]');
        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                isValid = false;
                errors.push(`Le champ ${field.name} est requis`);
                field.classList.add('is-invalid');
            } else {
                field.classList.remove('is-invalid');
            }
        });
        
        // Validate email
        const emailField = form.querySelector('input[type="email"]');
        if (emailField && emailField.value && !LabApp.validateEmail(emailField.value)) {
            isValid = false;
            errors.push('Email invalide');
            emailField.classList.add('is-invalid');
        }
        
        // Validate phone
        const phoneField = form.querySelector('input[name="telephone"]');
        if (phoneField && phoneField.value && !LabApp.validatePhone(phoneField.value)) {
            isValid = false;
            errors.push('Numéro de téléphone invalide');
            phoneField.classList.add('is-invalid');
        }
        
        if (!isValid) {
            LabApp.showNotification(errors.join('<br>'), 'danger');
        }
        
        return isValid;
    }
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    LabApp.init();
    
    // Setup form validation
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', (e) => {
            if (!FormValidator.validatePersonnelForm(form)) {
                e.preventDefault();
            }
        });
    });
});

// Make functions globally available
window.viewDetails = PersonnelManager.viewDetails.bind(PersonnelManager);
window.deletePersonnel = PersonnelManager.deletePersonnel.bind(PersonnelManager);
window.exportTableToCSV = LabApp.exportTableToCSV.bind(LabApp);
window.printSection = LabApp.printSection.bind(LabApp);