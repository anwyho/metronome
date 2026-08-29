export {};

declare global {
  interface OfflineWorkerConfig {
    version: string;
    build: string;
    precache: readonly string[];
    cachePrefix: string;
    shell?: string;
  }
  function offlineWorker(config: OfflineWorkerConfig): void;
  interface ServiceWorkerGlobalScope {
    offlineWorker: typeof offlineWorker;
  }
}
