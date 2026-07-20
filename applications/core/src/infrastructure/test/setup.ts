import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { beforeAll, afterAll } from 'vitest';

// =============================================================================
// Setup global pour les tests Vitest
// =============================================================================

// Créer un dossier temporaire pour les tests de configuration
const testDataDir = path.join(os.tmpdir(), 'ha-test-data');
const testConfigPath = path.join(testDataDir, 'config.yaml');
const testLogsDir = path.join(os.tmpdir(), 'ha-test-logs');

// Nettoyer et créer les dossiers avant les tests
beforeAll(() => {
  // Nettoyer les dossiers de test s'ils existent
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
  if (fs.existsSync(testLogsDir)) {
    fs.rmSync(testLogsDir, { recursive: true, force: true });
  }
  
  // Créer les dossiers
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.mkdirSync(testLogsDir, { recursive: true });
});

// Nettoyer après les tests
afterAll(() => {
  try {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true, force: true });
    }
  } catch {
    // Ignorer les erreurs de nettoyage
  }
});

// Exporter les chemins pour utilisation dans les tests
export const TEST_CONFIG_PATH = testConfigPath;
export const TEST_LOGS_DIR = testLogsDir;

// Configuration de base valide pour les tests
export const validTestConfig = {
  ha: {
    ws: {
      host: '192.168.1.100',
      port: 8123,
      token: 'test-token',
      reconnect_delay: 5,
    },
    structure: {
      include_unassigned: false,
      unassigned_label: 'Non assigné',
    },
  },
  web: {
    port: 8080,
    host: '0.0.0.0',
  },
  logging: {
    level: 'info',
    rotate: {
      max_size_mb: 10,
      max_files: 5,
    },
  },
};

export const minimalTestConfig = {
  ha: {
    ws: {
      host: 'localhost',
      token: 'token',
    },
  },
};
