// services/dbService.ts

import { LogLevel } from '../types';
import { broadcastLog } from './luminousService';

const DB_NAME = 'luminous-consciousness-db';
const DB_VERSION = 1;

const STORE_SESSION_DATA = 'session_data';
const STORE_MEMORY_EMBEDDINGS = 'memory_embeddings';

let db: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      broadcastLog(LogLevel.ERROR, `IndexedDB error: ${request.error?.message}`);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = () => {
      const dbInstance = request.result;
      if (!dbInstance.objectStoreNames.contains(STORE_SESSION_DATA)) {
        dbInstance.createObjectStore(STORE_SESSION_DATA, { keyPath: 'key' });
      }
      if (!dbInstance.objectStoreNames.contains(STORE_MEMORY_EMBEDDINGS)) {
        dbInstance.createObjectStore(STORE_MEMORY_EMBEDDINGS, { keyPath: 'id' });
      }
    };
  });
};

export const saveData = async (storeName: string, key: string, value: any): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    store.put({ key, value });
  } catch (error) {
    broadcastLog(LogLevel.ERROR, `Failed to save data to IndexedDB store '${storeName}': ${error}`);
  }
};

export const loadData = async <T>(storeName: string, key: string): Promise<T | null> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    broadcastLog(LogLevel.ERROR, `Failed to load data from IndexedDB store '${storeName}': ${error}`);
    return null;
  }
};

export const saveEmbeddings = async (embeddings: { id: number; chunk: string; embedding: number[] }[]): Promise<void> => {
    try {
        const db = await openDB();
        const transaction = db.transaction(STORE_MEMORY_EMBEDDINGS, 'readwrite');
        const store = transaction.objectStore(STORE_MEMORY_EMBEDDINGS);
        embeddings.forEach(item => store.put(item));
    } catch (error) {
        broadcastLog(LogLevel.ERROR, `Failed to save embeddings to IndexedDB: ${error}`);
    }
};

export const loadEmbeddings = async (): Promise<{ id: number; chunk: string; embedding: number[] }[] | null> => {
    try {
        const db = await openDB();
        const transaction = db.transaction(STORE_MEMORY_EMBEDDINGS, 'readonly');
        const store = transaction.objectStore(STORE_MEMORY_EMBEDDINGS);
        const request = store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                resolve(request.result.length > 0 ? request.result : null);
            };
            request.onerror = () => {
                reject(request.error);
            };
        });
    } catch (error) {
        broadcastLog(LogLevel.ERROR, `Failed to load embeddings from IndexedDB: ${error}`);
        return null;
    }
};
