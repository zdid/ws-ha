import type { ApplicationModule, ModuleUiMetadata } from '../../../core/dist/types/config';
import { ARBREOUQUOI_SOCKET_EVENTS } from './socket-events';

// Métadonnées UI pour la génération automatique
export const ARBREOUQUOI_UI_METADATA: ModuleUiMetadata = {
  title: 'Arbre Ou Quoi - Visualisation du Référentiel HA',
  description: 'Visualise la hiérarchie des entités Home Assistant organisées par OU → QUOI → Entités',
  icon: '🌳',
  fields: [
    {
      name: 'filterByArea',
      label: 'Filtrer par OU',
      type: 'select',
      options: []
    },
    {
      name: 'filterByQuoi',
      label: 'Filtrer par type (QUOI)',
      type: 'select',
      options: []
    },
    {
      name: 'showOnlyActive',
      label: 'Afficher uniquement les entités actives',
      type: 'boolean'
    }
  ]
};

// Déclaration du module
export const ARBREOUQUOI_APP: ApplicationModule = {
  id: 'arbreouquoi',
  name: 'Arbre Ou Quoi',
  description: 'Application de visualisation du référentiel Home Assistant organisé par Area → QUOI → Entités',
  icon: '🌳',
  type: 'standalone',
  configurable: true,
  requiredMqtt: false,
  requiredHaWs: true,
  socketEvents: ARBREOUQUOI_SOCKET_EVENTS,
  configUi: ARBREOUQUOI_UI_METADATA,
  configSection: 'arbreouquoi'
};

// Factories
export * from './ArbreouquoiService';
export * from './socket-events';
export * from './config-schema';
export * from './types';
