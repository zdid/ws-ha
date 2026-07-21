# TODO - Communication Inter-Applications (Version Simplifiée)

**Date :** 20 Juillet 2026  
**Approche :** Documentation décentralisée - chaque application documente ses propres événements dans SA spec.

---

## ✅ Déjà fait

- [x] `/applications/core/src/exports.ts` - Point d'entrée unique créé
- [x] `/specs/current/inter-app-communication_specs_v1.0.md` - Spec du système de communication (simplifiée)
- [x] `/specs/current/guide-nouvelle-application_specs_v1.1.md` - Guide mis à jour (simplifié)
- [x] `/specs/CHANGELOG.md` - Mise à jour
- [x] `/specs/current/techniques-socle-ha-mqtt_specs_v4.6.md` - Section 5.5 ajoutée (simplifiée)
- [x] Section 9 ajoutée à `fonctionnelles-rfxcom_specs_v5.5.md`
- [x] Section 9 ajoutée à `implementation-rfxcom_specs_v1.0.md`
- [x] Section 9 ajoutée à `fonctionnelles-arbreouquoi_specs_v1.0.md`
- [x] Section 9 ajoutée à `implementation-arbreouquoi_specs_v1.0.md`
- [x] Section 9 ajoutée à `fonctionnelles-nommage_specs_v1.0.md`
- [x] Section 9 ajoutée à `implementation-nommage_specs_v1.0.md`

---

## ✅ TODOs terminés

Tous les objectifs ont été atteints !

> **⚠️ IMPORTANT :** Cette section documente les événements et capacités que cette application **expose** aux autres applications.
> 
> **Pour utiliser ces capacités :**
> - Import depuis le core : `import { InterAppClient } from '../../../core/src/exports'`
> - Utiliser `interAppClient.request()` pour les Request/Reply
> - Utiliser `interAppClient.on()` pour écouter les événements Fire & Forget
> - Voir [inter-app-communication_specs_v1.0.md](../inter-app-communication_specs_v1.0.md) pour les détails

### 9.1 Événements Fire & Forget (Écoute possible par d'autres applications)

| Événement | Description | Payload Type | Fréquence | Émetteur |
|-----------|-------------|--------------|-----------|----------|
| `{app}:event-name` | Description claire | `EventPayloadType` | Selon contexte | Cette application |

**Type du payload :**
```typescript
export interface EventPayloadType {
  // Propriétés...
}
```

**Exemple d'écoute depuis une autre application :**
```typescript
import { InterAppClient } from '../../../core/src/exports';

this.interAppClient.on('{app}:event-name', (payload, fromApp) => {
  // payload est de type EventPayloadType
  console.log(`Événement reçu de ${fromApp}:`, payload);
});
```

### 9.2 Capacités Request/Reply (Appel possible depuis d'autres applications)

| Capacité | Description | Request Type | Reply Type | Timeout conseillé |
|----------|-------------|--------------|------------|-------------------|
| `{app}:action` | Description claire | `RequestPayloadType` | `ReplyResultType` | 5000ms |

**Types :**
```typescript
// Request
export interface RequestPayloadType {
  // Propriétés...
}

// Reply
export interface ReplyResultType {
  // Propriétés...
}
```

**Exemple d'appel depuis une autre application :**
```typescript
import { InterAppClient } from '../../../core/src/exports';
import type { RequestPayloadType, ReplyResultType } from '../{app}/specs';

const reply = await interAppClient.request<
  RequestPayloadType,
  ReplyResultType
>(
  '{app}:action',
  { /* RequestPayloadType */ },
  5000 // Timeout 5 secondes
);

if (reply.status === 'success') {
  // reply.result est de type ReplyResultType
  console.log('Succès:', reply.result);
} else {
  console.error('Erreur:', reply.error?.message);
}
```

**Handler côté récepteur (dans cette application) :**
```typescript
import { InterAppClient } from '../../../core/src/exports';

this.interAppClient.onRequest('{app}:action', (request, reply) => {
  // request.payload est de type RequestPayloadType
  try {
    const result: ReplyResultType = processRequest(request.payload);
    reply({
      requestId: request.requestId,
      inReplyTo: request.requestId,
      fromApp: '{app}',
      status: 'success',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    reply({
      requestId: request.requestId,
      inReplyTo: request.requestId,
      fromApp: '{app}',
      status: 'error',
      error: {
        code: 'APP_ERROR',
        message: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});
```
```

---

### 2️⃣ **Liste des specs d'application modifiées**

| Spec | Application | Statut | Priorité |
|------|-------------|--------|----------|
| `fonctionnelles-rfxcom_specs_v5.5.md` | RFXCOM | ✅ | Haute |
| `implementation-rfxcom_specs_v1.0.md` | RFXCOM | ✅ | Haute |
| `fonctionnelles-arbreouquoi_specs_v1.0.md` | ArbreOUQuoi | ✅ | Moyenne |
| `implementation-arbreouquoi_specs_v1.0.md` | ArbreOUQuoi | ✅ | Moyenne |
| `fonctionnelles-nommage_specs_v1.0.md` | Nommage | ✅ | Moyenne |
| `implementation-nommage_specs_v1.0.md` | Nommage | ✅ | Moyenne |

---

### 3️⃣ **Simplifier les specs générales**

**TERMINÉ :** Toutes les mentions de registry central ont été supprimées.

**Fichiers nettoyés :**
- [x] `/specs/current/inter-app-communication_specs_v1.0.md` - Sections registry supprimées
- [x] `/specs/current/guide-nouvelle-application_specs_v1.1.md` - Mentions registry supprimées
- [x] `/specs/current/techniques-socle-ha-mqtt_specs_v4.6.md` - Section 5.5.4 mise à jour

---

## 🎯 **Tâches par fichier**

### `fonctionnelles-rfxcom_specs_v5.5.md`
- [ ] Ajouter section 9 à la fin du fichier
- [ ] Documenter événements Fire & Forget (ex: `rfxcom:device:detected`, `rfxcom:device:removed`)
- [ ] Documenter capacités Request/Reply (si applicable)

### `implementation-rfxcom_specs_v1.0.md`
- [ ] Ajouter section 9 à la fin du fichier
- [ ] Documenter événements et capacités spécifiques à l'implémentation

### `fonctionnelles-arbreouquoi_specs_v1.0.md`
- [ ] Ajouter section 9 à la fin du fichier
- [ ] Documenter événements et capacités

### `implementation-arbreouquoi_specs_v1.0.md`
- [ ] Ajouter section 9 à la fin du fichier
- [ ] Documenter événements et capacités

### `fonctionnelles-nommage_specs_v1.0.md`
- [ ] Ajouter section 9 à la fin du fichier
- [ ] Documenter événements et capacités

### `implementation-nommage_specs_v1.0.md`
- [ ] Ajouter section 9 à la fin du fichier
- [ ] Documenter événements et capacités

---

## 📊 **Résumé visuel**

```
Spécifications générales
│
├── inter-app-communication_specs_v1.0.md  ✅ Créée (à simplifier)
├── guide-nouvelle-application_specs_v1.1.md  ✅ Créée (à simplifier)
└── techniques-socle-ha-mqtt_specs_v4.6.md  ✅ Mise à jour (à simplifier)

Spécifications d'applications  ⏳ À modifier
│
├── fonctionnelles-rfxcom_specs_v5.5.md          ⏳ Section 9 à ajouter
├── implementation-rfxcom_specs_v1.0.md         ⏳ Section 9 à ajouter
├── fonctionnelles-arbreouquoi_specs_v1.0.md    ⏳ Section 9 à ajouter
├── implementation-arbreouquoi_specs_v1.0.md   ⏳ Section 9 à ajouter
├── fonctionnelles-nommage_specs_v1.0.md        ⏳ Section 9 à ajouter
└── implementation-nommage_specs_v1.0.md       ⏳ Section 9 à ajouter

Implémentation
│
└── /applications/core/src/exports.ts  ✅ Déjà créé
```

---

## ✅ **Toutes les tâches terminées**

**Résumé :**
- 6 specs d'application : section 9 ajoutée ✅
- 3 specs générales : simplifiées ✅
- exports.ts : créé ✅

**Prochaine étape :** Vérification et tests

---

## 📝 **Notes**

- **Pas de registry central** - chaque application est responsable de sa propre documentation
- **Pas de fichiers séparés** - tout est dans les specs existantes
- **Approche décentralisée** - simple et maintenable
- **Pattern uniforme** - même structure de section dans toutes les specs
