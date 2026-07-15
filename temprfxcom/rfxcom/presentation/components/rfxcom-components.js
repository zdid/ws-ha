// ============================================================================
// RFXCOM Components - Définitions globales
// Ce fichier doit être chargé AVANT qu'Alpine ne parse le DOM
// Les fonctions sont définies dans window pour être accessibles partout
// ============================================================================

// --- Fonction composant Devices ---
window.rfxcomDevicesComponent = function rfxcomDevicesComponent() {
  return {
    // Données
    devices: [],
    filteredDevices: [],
    selectedDevice: null,
    isRefreshing: false,
    isTesting: false,
    isSaving: false,
    
    // Filtres
    filters: {
      type: '',
      protocol: '',
      exposedToHa: '',
    },
    
    // Au chargement du composant
    init() {
      // Écouter les événements RFXCOM
      // Obtenir le socket depuis le store Alpine ou window
      const getSocket = () => {
        if (typeof Alpine !== 'undefined' && Alpine.store('appStore')?.socket) {
          return Alpine.store('appStore').socket;
        }
        if (window.socket) return window.socket;
        if (typeof io !== 'undefined') return io();
        return null;
      };
      this.socket = getSocket();
      
      if (!this.socket) {
        console.error('[RFXCOM Devices] Socket.io non disponible');
        return;
      }
      
      // Demander la liste des devices
      this.socket.emit('rfxcom:devices:list');
      
      // Écouter la réponse
      this.socket.on('rfxcom:devices:list', (event) => {
        this.devices = event.devices.map(d => ({
          ...d,
          // Ajouter des propriétés pour l'UI
          haExposed: d.haExposed !== undefined ? d.haExposed : true,
          quoi: d.quoi || '',
          ou: d.ou || '',
        }));
        this.applyFilters();
      });
      
      // Écouter les nouveaux devices
      this.socket.on('rfxcom:device:detected', (event) => {
        const newDevice = {
          ...event.device,
          haExposed: true,
          quoi: '',
          ou: '',
        };
        this.devices.push(newDevice);
        this.applyFilters();
      });
      
      // Écouter les mises à jour de device
      this.socket.on('rfxcom:device:state', (event) => {
        const index = this.devices.findIndex(d => d.id === event.deviceId);
        if (index !== -1) {
          this.devices[index] = { ...this.devices[index], ...event.state };
        }
      });
    },
    
    // Appliquer les filtres
    applyFilters() {
      this.filteredDevices = this.devices.filter(device => {
        if (this.filters.type && device.type !== this.filters.type) return false;
        if (this.filters.protocol && device.protocol !== this.filters.protocol) return false;
        if (this.filters.exposedToHa && device.haExposed !== (this.filters.exposedToHa === 'true')) return false;
        return true;
      });
    },
    
    // Réinitialiser les filtres
    resetFilters() {
      this.filters = { type: '', protocol: '', exposedToHa: '' };
      this.applyFilters();
    },
    
    // Rafraîchir la liste des devices
    refreshDevices() {
      this.isRefreshing = true;
      this.socket.emit('rfxcom:devices:refresh');
      setTimeout(() => { this.isRefreshing = false; }, 2000);
    },
    
    // Tester un device
    testDevice(device) {
      this.isTesting = true;
      this.socket.emit('rfxcom:device:test', { deviceId: device.id });
      setTimeout(() => { this.isTesting = false; }, 2000);
    },
    
    // Tester tous les devices
    testAllDevices() {
      this.isTesting = true;
      this.socket.emit('rfxcom:device:test', { deviceId: 'all' });
      setTimeout(() => { this.isTesting = false; }, 5000);
    },
    
    // Sauvegarder un device
    saveDevice(device) {
      this.isSaving = true;
      this.socket.emit('rfxcom:device:update', {
        deviceId: device.id,
        data: {
          quoi: device.quoi,
          ou: device.ou,
        }
      });
      setTimeout(() => { this.isSaving = false; }, 500);
    },
    
    // Basculer l'exposition HA
    toggleHaExposure(device) {
      this.socket.emit('rfxcom:device:update', {
        deviceId: device.id,
        data: {
          haExposed: device.haExposed,
        }
      });
    },
    
    // Supprimer un device
    deleteDevice(device) {
      if (confirm(`Voulez-vous vraiment supprimer le device "${device.quoi || device.id}"?`)) {
        this.socket.emit('rfxcom:device:delete', { deviceId: device.id });
      }
    },
    
    // Afficher les détails d'un device
    showDeviceDetails(device) {
      this.selectedDevice = { ...device };
    },
    
    // Formater la date du dernier vu
    formatLastSeen(dateString) {
      if (!dateString) return '—';
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffSecs < 60) return 'À l\'instant';
      if (diffMins < 60) return `il y a ${diffMins}m`;
      if (diffHours < 24) return `il y a ${diffHours}h`;
      return `il y a ${diffDays}j`;
    },
    
    // Obtenir le label du type de device
    getDeviceTypeLabel(type) {
      const labels = {
        'light': 'Lumière',
        'switch': 'Interrupteur',
        'cover': 'Volet',
        'sensor': 'Capteur',
        'scene': 'Scène',
        'thermostat': 'Thermostat',
      };
      return labels[type] || type;
    },
    
    // Classe pour le niveau de signal
    getSignalLevelClass(strength) {
      if (strength >= 80) return 'signal-excellent';
      if (strength >= 60) return 'signal-good';
      if (strength >= 40) return 'signal-fair';
      if (strength >= 20) return 'signal-weak';
      return 'signal-poor';
    },
    
    // Classe pour le niveau de batterie
    getBatteryLevelClass(level) {
      if (level === undefined) return '';
      if (level >= 80) return 'battery-high';
      if (level >= 50) return 'battery-medium';
      if (level >= 20) return 'battery-low';
      return 'battery-critical';
    },
  };
};

// --- Fonction composant Receivers ---
window.rfxcomReceiversComponent = function rfxcomReceiversComponent() {
  return {
    // Données
    receivers: [],
    filteredReceivers: [],
    selectedReceiver: null,
    showCreateModal: false,
    showPairingModalFor: null,
    selectedProtocol: '',
    availableEmitters: [],
    selectedEmitters: new Set(),
    allDevices: [],
    
    // Nouveau récepteur
    newReceiver: {
      id: '',
      name: '',
      quoi: '',
      ou: '',
      type: '',
      protocol: '',
      deviceId: '',
      sensorId: '',
      unitCode: 0,
      subunitCode: undefined,
      groupCode: '',
      houseCode: '',
      haExposed: true,
      inverted: false,
      emitters: [],
      primaryEmitter: null,
    },
    
    // Filtres
    filters: {
      type: '',
      protocol: '',
      exposedToHa: '',
    },
    
    // Au chargement du composant
    init() {
      // Écouter les événements RFXCOM
      // Obtenir le socket depuis le store Alpine ou window
      const getSocket = () => {
        if (typeof Alpine !== 'undefined' && Alpine.store('appStore')?.socket) {
          return Alpine.store('appStore').socket;
        }
        if (window.socket) return window.socket;
        if (typeof io !== 'undefined') return io();
        return null;
      };
      this.socket = getSocket();
      
      if (!this.socket) {
        console.error('[RFXCOM Receivers] Socket.io non disponible');
        return;
      }
      
      // Demander la liste des récepteurs
      this.socket.emit('rfxcom:receivers:list');
      
      // Demander la liste des devices (pour les émetteurs)
      this.socket.emit('rfxcom:devices:list');
      
      // Écouter la réponse des récepteurs
      this.socket.on('rfxcom:receivers:list', (event) => {
        this.receivers = event.receivers.map(r => ({
          ...r,
          // Ajouter des propriétés pour l'UI
          haExposed: r.haExposed !== undefined ? r.haExposed : true,
          quoi: r.quoi || '',
          ou: r.ou || '',
          emitters: r.emitters || [],
        }));
        this.applyFilters();
      });
      
      // Écouter la réponse des devices (émetteurs)
      this.socket.on('rfxcom:devices:list', (event) => {
        this.allDevices = event.devices;
      });
      
      // Écouter les nouveaux récepteurs
      this.socket.on('rfxcom:receiver:created', (event) => {
        this.receivers.push({
          ...event.receiver,
          haExposed: true,
          quoi: '',
          ou: '',
          emitters: [],
        });
        this.applyFilters();
      });
      
      // Écouter les mises à jour de récepteur
      this.socket.on('rfxcom:receiver:updated', (event) => {
        const index = this.receivers.findIndex(r => r.id === event.receiver.id);
        if (index !== -1) {
          this.receivers[index] = { ...this.receivers[index], ...event.receiver };
          this.applyFilters();
        }
      });
      
      // Écouter la suppression de récepteur
      this.socket.on('rfxcom:receiver:deleted', (event) => {
        this.receivers = this.receivers.filter(r => r.id !== event.receiverId);
      });
    },
    
    // Appliquer les filtres
    applyFilters() {
      this.filteredReceivers = this.receivers.filter(receiver => {
        if (this.filters.type && receiver.type !== this.filters.type) return false;
        if (this.filters.protocol && receiver.protocol !== this.filters.protocol) return false;
        if (this.filters.exposedToHa && receiver.haExposed !== (this.filters.exposedToHa === 'true')) return false;
        return true;
      });
    },
    
    // Réinitialiser les filtres
    resetFilters() {
      this.filters = { type: '', protocol: '', exposedToHa: '' };
      this.applyFilters();
    },
    
    // Afficher le modal de création
    showCreateReceiverModal() {
      this.newReceiver = {
        id: '',
        name: '',
        quoi: '',
        ou: '',
        type: '',
        protocol: '',
        deviceId: '',
        sensorId: '',
        unitCode: 0,
        subunitCode: undefined,
        groupCode: '',
        houseCode: '',
        haExposed: true,
        inverted: false,
        emitters: [],
        primaryEmitter: null,
      };
      this.showCreateModal = true;
    },
    
    // Peut créer un récepteur ?
    canCreateReceiver() {
      return this.newReceiver.id && 
             this.newReceiver.quoi && 
             this.newReceiver.ou &&
             this.newReceiver.type &&
             this.newReceiver.protocol;
    },
    
    // Créer un récepteur
    createReceiver() {
      this.socket.emit('rfxcom:receiver:create', this.newReceiver);
      this.showCreateModal = false;
    },
    
    // Sauvegarder un récepteur
    saveReceiver(receiver) {
      this.socket.emit('rfxcom:receiver:update', {
        receiverId: receiver.id,
        data: {
          quoi: receiver.quoi,
          ou: receiver.ou,
        }
      });
    },
    
    // Basculer l'exposition HA
    toggleHaExposure(receiver) {
      this.socket.emit('rfxcom:receiver:update', {
        receiverId: receiver.id,
        data: {
          haExposed: receiver.haExposed,
        }
      });
    },
    
    // Supprimer un récepteur
    deleteReceiver(receiver) {
      if (confirm(`Voulez-vous vraiment supprimer le récepteur "${receiver.quoi || receiver.id}"?`)) {
        this.socket.emit('rfxcom:receiver:delete', { receiverId: receiver.id });
      }
    },
    
    // Afficher les détails d'un récepteur
    showReceiverDetails(receiver) {
      this.selectedReceiver = { ...receiver };
    },
    
    // Afficher le modal d'appairage
    showPairingModal(receiver) {
      this.showPairingModalFor = receiver.id;
      this.selectedProtocol = '';
      this.selectedEmitters = new Set(receiver.emitters || []);
      this.filterEmittersByProtocol();
    },
    
    // Mettre à jour les émetteurs disponibles en fonction du protocole
    filterEmittersByProtocol() {
      if (!this.selectedProtocol || !this.allDevices) {
        this.availableEmitters = [];
        return;
      }
      
      // Filtrer les devices qui correspondent au protocole
      const protocolMap = {
        'rfxsensor': ['sensor1'],
        'rfxmeter': ['sensor1'],
        'lighting1': ['lighting1'],
        'lighting2': ['lighting2'],
        'lighting3': ['lighting3'],
        'lighting4': ['lighting4'],
        'lighting5': ['lighting5'],
        'lighting6': ['lighting6'],
        'switch1': ['switch1'],
        'switch2': ['switch2'],
        'blinds1': ['blinds1'],
        'blinds2': ['blinds2'],
        'blinds3': ['blinds3'],
      };
      
      const targetProtocols = protocolMap[this.selectedProtocol] || [this.selectedProtocol];
      this.availableEmitters = this.allDevices.filter(d => 
        targetProtocols.includes(d.protocol)
      );
    },
    
    // L'émetteur est-il sélectionné ?
    isEmitterSelected(emitterId) {
      return this.selectedEmitters.has(emitterId);
    },
    
    // Basculer la sélection d'un émetteur
    toggleEmitterSelection(emitterId) {
      if (this.selectedEmitters.has(emitterId)) {
        this.selectedEmitters.delete(emitterId);
      } else {
        this.selectedEmitters.add(emitterId);
      }
    },
    
    // Définir comme primaire
    setAsPrimary(emitterId) {
      if (!this.isEmitterSelected(emitterId)) return;
      const receiver = this.getCurrentReceiver();
      if (receiver) {
        receiver.primaryEmitter = emitterId;
      }
    },
    
    // Obtenir le récepteur courant pour l'appairage
    getCurrentReceiver() {
      if (!this.showPairingModalFor) return null;
      return this.receivers.find(r => r.id === this.showPairingModalFor);
    },
    
    // Sauvegarder l'appairage
    savePairing() {
      const receiver = this.getCurrentReceiver();
      if (!receiver) return;
      
      this.socket.emit('rfxcom:receiver:update', {
        receiverId: receiver.id,
        data: {
          emitters: Array.from(this.selectedEmitters),
          primaryEmitter: receiver.primaryEmitter,
        }
      });
      
      this.showPairingModalFor = null;
    },
    
    // Obtenir le nom d'un émetteur
    getEmitterName(emitter) {
      return emitter.quoi || emitter.ou || emitter.id;
    },
    
    // Obtenir le nom d'un émetteur par ID
    getEmitterNameById(emitterId) {
      if (!this.allDevices) return emitterId;
      const emitter = this.allDevices.find(d => d.id === emitterId);
      return emitter ? this.getEmitterName(emitter) : emitterId;
    },
    
    // Obtenir le nom du récepteur
    getReceiverName(receiverId) {
      const receiver = this.receivers.find(r => r.id === receiverId);
      return receiver ? receiver.quoi || receiver.ou || receiver.id : receiverId;
    },
    
    // Formater le label du type de récepteur
    getReceiverTypeLabel(type) {
      const labels = {
        'light': 'Lumière',
        'switch': 'Interrupteur',
        'cover': 'Volet',
        'scene': 'Scène',
        'thermostat': 'Thermostat',
      };
      return labels[type] || type;
    },
    
    // Obtenir l'icône du label d'émetteur
    getEmitterLabel(emitter) {
      return emitter.quoi || emitter.ou || emitter.id;
    },
  };
};

// Initialiser les composants si Alpine est déjà chargé
if (typeof Alpine !== 'undefined') {
  console.log('[RFXCOM Components] Définitions globales chargées');
}
