// Déclaration minimale pour Alpine.js, chargé globalement par le core (vendorisé dans
// applications/core/src/presentation/ui/vendor/alpine.js, voir alpinejs-implementation_specs_v1.0.md)
// avant que le contenu de cette application ne soit injecté dans le Shadow DOM de
// ModuleContainer.ts — window.Alpine existe déjà au moment où ce module s'exécute.
declare global {
  interface Window {
    Alpine: any;
  }
}

export {};
