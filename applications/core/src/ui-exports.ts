// =============================================================================
// CORE UI EXPORTS - Point d'entrée navigateur pour les applications
// =============================================================================
// Contrairement à exports.ts (backend Node.js), ce fichier regroupe le code
// du core destiné à être exécuté dans le navigateur (dépend de `window`,
// `document`, du script global socket.io-client, etc.). Séparé de exports.ts
// pour que les applications backend (ex: nommage/src/domain/*) qui importent
// exports.ts n'entraînent pas la compilation de code navigateur dans leur
// dist Node.
//
// Usage pour les UIs des applications dérivées :
//   import { SocketService } from '.../core/src/ui-exports';
// =============================================================================

export { SocketService } from './presentation/ui/ts/services/SocketService';
