# TODO - Communication Inter-Applications

**Date :** 20 Juillet 2026  
**Statut :** En cours  
**Priorité :** Haute

---

## 📋 Résumé

Implémentation du système de communication inter-applications avec pattern Request/Reply asynchrone et corrélation.

**Objectif :** Permettre aux applications de communiquer entre elles via l'EventBus partagé, avec :
- Déclaration explicite des capacités
- Pattern Request/Reply avec corrélation via `requestId`
- Pattern Fire & Forget pour les notifications
- Typage fort TypeScript
- Découvrabilité (runtime et développement)

---

## ✅ Déjà fait

### 1. Spécifications créées/modifiées
- [x] `/specs/current/inter-app-communication_specs_v1.0.md` - Spec complète
- [x] `/specs/current/guide-nouvelle-application_specs_v1.1.md` - Guide mis à jour
- [x] `/specs/CHANGELOG.md` - Mise à jour
- [x] `/specs/current/techniques-socle-ha-mqtt_specs_v4.6.md` - Section 5.5 ajoutée

### 2. Implémentation core
- [x] `/applications/core/src/exports.ts` - Point d'entrée unique créé

---

## 🔲 À faire (par priorité)

---

### 🟡 **Priorité Moyenne - Documentation**

#### 1. Documentation des capacités par application
**Objectif :** Chaque application a un chapitre dédié documentant ses events/capacités

**Approche choisie :** Simple et maintenable
- Créer un fichier par application dans `/specs/current/applications/`
- Chaque fichier documente les capacités Request/Reply et les événements Fire&Forget
- Un fichier index central référence tous les fichiers d'applications

**Fichiers à créer :**

```
/specs/current/
├── CAPABILITIES_INDEX.md              # Index central avec tableau récap
└── applications/
    ├── scheduler_capabilities.md    # Capacités du scheduler
    ├── rfxcom_capabilities.md       # Capacités de RFXCOM
    ├── ia_capabilities.md           # Capacités de l'IA
    ├── mqtt_capabilities.md         # Capacités de MQTT
    └── ...
```

**Contenu type pour `scheduler_capabilities.md` :**
```markdown
# Scheduler - Capacités Inter-Applications

**Version :** 1.0  
**Date :** 20 Juillet 2026  
**Application :** scheduler  
**Type :** standalone

---

## 📡 Capacités Request/Reply (avec réponse)

| Capacité | Description | Request Type | Reply Type | Timeout Max | Exemple |
|----------|-------------|--------------|------------|-------------|---------|
| `scheduler:schedule` | Planifier une nouvelle action | `ScheduleRequestPayload` | `ScheduleReplyResult` | 10s | Voir ci-dessous |
| `scheduler:cancel` | Annuler une planification existante | `CancelRequestPayload` | `CancelReplyResult` | 5s | Voir ci-dessous |
| `scheduler:list` | Lister toutes les planifications actives | `void` | `ScheduleItem[]` | 3s | Voir ci-dessous |
| `scheduler:get` | Récupérer une planification spécifique | `{scheduleId: string}` | `ScheduleItem \| null` | 2s | Voir ci-dessous |

### Types

#### ScheduleRequestPayload
```typescript
interface ScheduleRequestPayload {
  action: string;              // Action à exécuter (ex: "turn_on", "turn_off")
  at: string;                  // Quand exécuter (ISO8601 ou relative comme "+15m")
  target?: string;             // Entité ou topic cible (ex: "light.salon")
  payload?: Record<string, unknown>;  // Payload spécifique à l'action
  options?: {                  // Options de planification
    repeat?: string;           // "daily", "weekly", ou cron expression
    retryCount?: number;       // Nombre de tentatives en cas d'échec
    retryDelay?: number;       // Délai entre les tentatives (ms)
  };
}
```

#### ScheduleReplyResult
```typescript
interface ScheduleReplyResult {
  scheduleId: string;          // ID unique de la planification
  scheduledAt: string;        // ISO8601 - Quand l'action est planifiée
  status: 'scheduled' \| 'already-exists' \| 'invalid' \| 'conflict';
  message?: string;            // Message descriptif
}
```

#### CancelRequestPayload
```typescript
interface CancelRequestPayload {
  scheduleId: string;          // ID de la planification à annuler
  force?: boolean;            // Forcer l'annulation même si déjà exécutée
}
```

#### CancelReplyResult
```typescript
interface CancelReplyResult {
  success: boolean;
  scheduleId: string;
  message?: string;
}
```

#### ScheduleItem
```typescript
interface ScheduleItem {
  id: string;
  action: string;
  at: string;
  status: 'pending' \| 'executed' \| 'cancelled' \| 'failed' \| 'missed';
  target?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  executedAt?: string;
  errorMessage?: string;
}
```

---

## 📢 Événements Fire & Forget (sans réponse)

| Événement | Description | Payload Type | Émetteur | Récepteurs typiques |
|-----------|-------------|--------------|----------|-------------------|
| `scheduler:executed` | Une planification a été exécutée avec succès | `ScheduleExecutedPayload` | scheduler | IA, MQTT, Logs |
| `scheduler:missed` | Une planification a été manquée | `ScheduleMissedPayload` | scheduler | IA, Alertes |
| `scheduler:created` | Une nouvelle planification a été créée | `ScheduleItem` | scheduler | IA, UI |
| `scheduler:cancelled` | Une planification a été annulée | `ScheduleItem` | scheduler | IA, UI |

### Types des payloads

#### ScheduleExecutedPayload
```typescript
interface ScheduleExecutedPayload {
  scheduleId: string;
  action: string;
  target?: string;
  executedAt: string;           // ISO8601
  success: boolean;
  errorMessage?: string;
}
```

#### ScheduleMissedPayload
```typescript
interface ScheduleMissedPayload {
  scheduleId: string;
  action: string;
  scheduledAt: string;          // ISO8601 - Quand c'était prévu
  missedAt: string;             // ISO8601 - Quand le miss a été détecté
  reason: 'device-offline' \| 'error' \| 'timeout' \| 'unknown';
}
```

---

## 📖 Exemples d'utilisation

### Exemple 1 : Planifier une action (Request/Reply)
```typescript
import { InterAppClient } from '../../../core/src/application/InterAppClient';
import type { ScheduleRequestPayload, ScheduleReplyResult } from './capabilities';

const reply = await interAppClient.request<
  ScheduleRequestPayload,
  ScheduleReplyResult
>(
  'scheduler:schedule',
  {
    action: 'turn_on',
    at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // Dans 15 min
    target: 'light.salon',
    payload: { brightness: 200 }
  },
  5000 // Timeout 5 secondes
);

if (reply.status === 'success') {
  console.log('Planification créée:', reply.result.scheduleId);
}
```

### Exemple 2 : Écouter les exécutions (Fire & Forget)
```typescript
interAppClient.on('scheduler:executed', (payload, fromApp) => {
  console.log(`Planification exécutée par ${fromApp}:`, payload);
  // payload est de type ScheduleExecutedPayload
});
```

### Exemple 3 : Répondre à une requête (côté Scheduler)
```typescript
interAppClient.onRequest(
  'scheduler:schedule',
  SCHEDULER_CAPABILITIES.handledRequests['scheduler:schedule'].handler
);
```

---

## 🔗 Voir aussi
- [Spécification complète](inter-app-communication_specs_v1.0.md)
- [Guide nouvelle application](guide-nouvelle-application_specs_v1.1.md)
```

**Fichier CAPABILITIES_INDEX.md :**
```markdown
# 📚 Index des Capacités Inter-Applications

**Dernière mise à jour :** 20 Juillet 2026

> **Comment ajouter une application :**
> 1. Créer le fichier `applications/{app-name}_capabilities.md`
> 2. Ajouter l'entrée dans le tableau ci-dessous
> 3. Suivre le template défini dans ce dossier

---

## 📋 Applications et leurs Capacités

| Application | Type | Capacités Request/Reply | Événements Fire&Forget | Fichier | Statut |
|-------------|------|-------------------------|----------------------|---------|--------|
| [core](../techniques-socle-ha-mqtt_specs_v4.6.md) | core | 0 | EventBus, Socket.io | Intégré | ✅ |
| [scheduler](./applications/scheduler_capabilities.md) | standalone | 4 | 4 | Lien | ⏳ |
| [rfxcom](./applications/rfxcom_capabilities.md) | integration | 2 | 3 | Lien | ⏳ |
| [ia](./applications/ia_capabilities.md) | standalone | 1 | 2 | Lien | ⏳ |
| [mqtt](./applications/mqtt_capabilities.md) | integration | 0 | 5 | Lien | ⏳ |

---

## 📌 Conventions

### Nommage des capacités
- **Format :** `{domain}:{action}` (sans préfixe d'application)
- **Exemples :** `scheduler:schedule`, `rfxcom:device:detected`, `ia:analyze`
- **Règles :**
  - Utiliser des noms clairs et descriptifs
  - Éviter les noms trop génériques (`do`, `action`, `process`)
  - Utiliser des verbes pour les actions (`schedule`, `cancel`, `get`, `list`)

### Nommage des types
- **Request:** `{Capability}RequestPayload` ou `{Capability}Request`
- **Reply:** `{Capability}ReplyResult` ou `{Capability}Reply`
- **Event:** `{Capability}Payload` ou `{Capability}Event`

### Organisation des fichiers
```
specs/current/applications/
└── {app-name}_capabilities.md  # Un fichier par application
```

### Structure d'un fichier de capacités
1. En-tête avec métadonnées (version, date, application, type)
2. Section "Capacités Request/Reply" avec tableau
3. Section "Types" avec les interfaces TypeScript
4. Section "Événements Fire & Forget" avec tableau
5. Section "Exemples d'utilisation"
6. Section "Voir aussi"

---

## 🔍 Comment trouver une capacité ?

1. **Par nom :** Utiliser Ctrl+F dans ce dossier
2. **Par application :** Consulter le tableau ci-dessus
3. **Par type :** Utiliser les filtres de votre IDE

---

## ⚠️ Important

- **Toute nouvelle application DOIT** avoir son fichier de capacités
- **Toute modification de capacité DOIT** être répercutée dans le fichier correspondant
- **Les types DOIVENT** être copiés depuis le code source (pas de divergence)
```

#### 2. Créer les fichiers de capacités pour les applications existantes
- [ ] `scheduler_capabilities.md`
- [ ] `rfxcom_capabilities.md`
- [ ] `ia_capabilities.md`
- [ ] `mqtt_capabilities.md`
- [ ] `nommage_capabilities.md` (si applicable)
- [ ] `arbreouquoi_capabilities.md` (si applicable)

---

### 🟡 **Priorité Moyenne - Implémentation Core**

#### 3. Créer les types interapp dans le core
- [ ] `/applications/core/src/types/interapp.ts` - Créer ce fichier
  - `AppRequest<T>`
  - `AppReply<T, E>`
  - `ApplicationCapabilities`
  - `RequestHandler<T, R>`
  - `InterAppTimeoutError`
  - `InterAppReplyError`

#### 4. Créer InterAppClient dans le core
- [ ] `/applications/core/src/application/InterAppClient.ts` - Implémenter
  - `request<P, R>(capability, payload, timeout)`
  - `emit(eventName, payload)`
  - `on(eventName, handler)`
  - `onRequest(capability, handler)`
  - `sendReply(reply)`
  - `listCapabilities()`
  - `hasCapability(capabilityName)`
  - `cleanupExpired()`

#### 5. Mettre à jour AppService
- [ ] Ajouter `capabilityRegistry: Map<string, ApplicationCapabilities>`
- [ ] Ajouter `registerApplicationCapabilities(appId, capabilities)`
- [ ] Modifier `startApplicationService()` pour charger les capacités
- [ ] Vérifier les conflits de noms de capacités

---

### 🟡 **Priorité Moyenne - Mise à jour des applications existantes**

#### 6. Adapter chaque application
Pour chaque application (sauf core) :
- [ ] Créer `/applications/{app}/src/exports.ts`
- [ ] Créer `/applications/{app}/domain/capabilities.ts`
- [ ] Déclarer `ApplicationCapabilities`
- [ ] Exporter depuis `domain/index.ts`
- [ ] Initialiser `InterAppClient` dans le service
- [ ] Configurer les handlers avec `onRequest()`

Applications à adapter :
- [ ] scheduler
- [ ] rfxcom
- [ ] ia
- [ ] mqtt
- [ ] nommage
- [ ] arbreouquoi

---

## 📌 Dépendances entre tâches

```
Création types interapp
    │
    ▼
Création InterAppClient
    │
    ▼
    ├─► Mise à jour AppService
    │       │
    │       ▼
    │    Adaptation applications
    │
    ▼
Documentation des capacités
    │
    ▼
CAPABILITIES_INDEX.md
```

---

## 🎯 Prochaines étapes immédiates

1. **Créer** `/applications/core/src/types/interapp.ts` (30 min)
2. **Créer** `/applications/core/src/application/InterAppClient.ts` (1h)
3. **Mettre à jour** `/applications/core/src/application/AppService.ts` (30 min)
4. **Créer** `/specs/current/CAPABILITIES_INDEX.md` (15 min)
5. **Créer** `/specs/current/applications/scheduler_capabilities.md` (30 min)

**Temps estimé total :** ~3h

---

## 📝 Notes

- Le fichier `exports.ts` dans le core a déjà été créé
- Les specs principales ont déjà été mises à jour
- Il reste principalement l'implémentation technique et la documentation détaillée par application
- La découvrirabilité au développement sera assurée par les fichiers `*_capabilities.md` + les types TypeScript
