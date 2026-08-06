// Re-export the native module. On web, it will be resolved to SmartLifeLineListenerModule.web.ts
// and on native platforms to SmartLifeLineListenerModule.ts
export { default } from './src/SmartLifeLineListenerModule';
export * from './src/SmartLifeLineListener.types';
