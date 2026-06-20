export const AUTH_STORAGE_KEY = "spr-demo-auth";

const AUTHENTICATED_VALUE = "authenticated";

type AuthStorage = Storage | Map<string, string>;

export function isValidLogin(username: string, password: string) {
  return username.trim() === "admin" && password === "xi147258";
}

export function readStoredAuth(storage: AuthStorage) {
  return readStorageValue(storage, AUTH_STORAGE_KEY) === AUTHENTICATED_VALUE;
}

export function writeStoredAuth(storage: AuthStorage, isAuthenticated: boolean) {
  if (isAuthenticated) {
    writeStorageValue(storage, AUTH_STORAGE_KEY, AUTHENTICATED_VALUE);
    return;
  }
  removeStorageValue(storage, AUTH_STORAGE_KEY);
}

function readStorageValue(storage: AuthStorage, key: string) {
  if (storage instanceof Map) return storage.get(key) ?? null;
  return storage.getItem(key);
}

function writeStorageValue(storage: AuthStorage, key: string, value: string) {
  if (storage instanceof Map) {
    storage.set(key, value);
    return;
  }
  storage.setItem(key, value);
}

function removeStorageValue(storage: AuthStorage, key: string) {
  if (storage instanceof Map) {
    storage.delete(key);
    return;
  }
  storage.removeItem(key);
}
