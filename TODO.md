# Liste des problèmes à résoudre

## Problèmes prioritaires

### 🔴 [HAUTE PRIORITE] Indicateur de connexion RFXCOM
- **Problème** : L'UI affiche "Déconnecté" alors que le serveur a bien reçu des messages RFXCOM (transceiver connecté sur /dev/ttyUSB0)
- **Observé** :
  - Serveur trace : `[RfxComService] Message RFXCOM brut reçu: ...` (donc connexion OK)
  - Serveur trace : `[SocketBridge] Broadcast rfxcom:status, data: {"connected":true,...}`
  - Client affiche : "Déconnecté"
- **Hypothèses** :
  - Problème de synchronisation entre SocketBridge et le client après reconnexion
  - L'événement `rfxcom:status` n'est pas reçu ou pas traité correctement par l'UI
  - L'indicateur de connexion n'est pas mis à jour correctement
- **À vérifier** :
  - Le client reçoit-il bien l'événement `rfxcom:status` avec `connected: true` ?
  - L'écouteur dans `setupConnectionStatus()` est-il toujours actif après reconnexion ?
  - L'élément `#rfxcom-connection-status` existe-t-il dans le DOM ?
- **Statut** : En attente - trop de temps passé, à investiguer plus tard

---

## Problèmes secondaires

### 🟡 Sauvegarde de configuration
- **Problème** : Modification des champs sans clic sur "Sauvegarder" envoyait les données
- **Statut** : Corrigé (commit 1e84707 et 9ba5658)

### 🟡 Injection IAppConfigProvider
- **Problème** : `this.configService.getAppConfig is not a function`
- **Statut** : Corrigé (commit 32543ab)

### 🟡 Sauvegarde configuration avec anciennes données
- **Problème** : Modification de `serialPort` de `/dev/ttyACM0` à `/dev/ttyUSB0`, mais le serveur sauvegarde avec l'ancienne valeur
- **Observé** : 
  - Client envoie : `serialPort: "/dev/ttyUSB0"` dans le payload
  - Serveur sauvegarde : `serialPort: "/dev/ttyACM0"` dans le fichier
- **Cause possible** : Problème de synchronisation entre le formulaire et l'objet de configuration
- **À vérifier** : Vérifier que `TechnicalConfigManager` utilise bien les données courantes du formulaire avant envoi
- **Statut** : Non corrigé
- **Priorité** : Haute

### 🟡 Gestion des protocoles RFXCOM
- **Problème** : La librairie npm rfxcom permet de limiter la réception à certains protocoles. Il faut gérer cela dans l'UI.
- **À implémenter** :
  - Récupérer la liste des protocoles supportés depuis `rfxcom.protocols` au démarrage
  - Afficher une liste de cases à cocher dans les paramètres techniques RFXCOM
  - Envoyer les modifications au service RFXCOM via événements Socket.io
  - Appliquer les filtres au transceiver
- **Événements** : `rfxcom:protocols:list`, `rfxcom:protocol:toggle`, `rfxcom:protocols:update`
- **Statut** : Non implémenté
- **Priorité** : Moyenne

### 🟡 Envoi devices vers HA au démarrage
- **À implémenter** : Dès le démarrage de l'application, TOUS les devices avec `transmitToHa: true` doivent être envoyés à HA
- **Vérifier** : Le service RFXCOM publie-t-il bien les discoveries MQTT au démarrage ?
- **Statut** : Non implémenté
- **Priorité** : Moyenne

### 🟡 Architecture RFXCOM
- **Problème** : Le module `RfxComService` fait ~1800 lignes
- **Proposition d'éclatement** :
  - `RfxComCoreService` : Gestion du transceiver (connexion, déconnexion, messages bruts)
  - `RfxComDeviceManager` : Gestion des devices (détection, stockage, auto-discovery)
  - `RfxComReceiverManager` : Gestion des récepteurs et appairages
  - `RfxComSceneManager` : Gestion des scènes
  - `RfxComProtocolManager` : Gestion des protocoles activés
  - `RfxComHaBridge` : Intégration avec HA (discovery, états, commandes)
- **Statut** : En attente de validation
- **Priorité** : Basse

---

## Notes techniques

### Package npm utilisé
- **Nom** : `rfxcom`
- **Version** : v2.6.2 (d'après specs-implementation-rfxcom_specs_v1.0.md)
- **Vérification** : Voir `src/applications/rfxcom/domain/RfxComService.ts` ligne 30 : `import * as rfxcomLib from 'rfxcom';`
- **Confirmation** : ✅ Oui, le package npm utilisé est bien `rfxcom`

### Utilisation dans le code
```typescript
import * as rfxcomLib from 'rfxcom';
// puis
this.transceiver = new rfxcomLib.RfxCom(serialPort, options);
```

---

## Historique des commits récents
- `1e84707` - Fix perte de focus lors de la saisie dans ConfigForm
- `9ba5658` - Correction sauvegarde automatique ConfigForm et gestion des champs modules  
- `32543ab` - Correction démarrage automatique RFXCOM et injection IAppConfigProvider
