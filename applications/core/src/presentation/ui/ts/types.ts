// ======================================================================
// Types partagés pour l'application UI
// ======================================================================

import { Socket } from 'socket.io-client';

export interface Module {
  id: string;
  name: string;
  icon: string;
  status: 'configured' | 'partial' | 'missing' | 'error';
  configUi?: ModuleUiMetadata;
  menu?: ApplicationMenuConfig;
}

export interface MenuEntry {
  id?: string;
  label: string;
  icon?: string;
  path: string;
  order: number;
  badge?: string;
  parentId?: string;
}

export interface ApplicationMenuConfig {
  category: string;
  section: string;
  entry: MenuEntry;
  pages?: MenuEntry[];
}

export interface ModuleUiMetadata {
  title: string;
  description: string;
  fields: ConfigField[];
  icon?: string;
}

export interface ConfigField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'password';
  default?: any;
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  hint?: string;
  autocomplete?: string;
}

export interface LogEntry {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  module: string;
  message: string;
}

export { Socket };
