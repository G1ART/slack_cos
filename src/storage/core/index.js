import { createStore } from './storeFactory.js';

let coreStore = null;

export function initStoreCore({ storageMode } = {}) {
  coreStore = createStore({ storageMode });
  return coreStore;
}

export function getStoreCore() {
  if (!coreStore) {
    coreStore = createStore({ storageMode: process.env.STORAGE_MODE });
  }
  return coreStore;
}

export function getStorageMode() {
  return getStoreCore().storage_mode;
}

