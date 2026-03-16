/**
 * chrome.storage.local 기반 Supabase Auth storage adapter.
 * MV3 Service Worker에는 localStorage가 없으므로 이 adapter를 사용.
 * Background에서는 토큰 읽기만 가능, Auth 조작은 popup/sidepanel에서만.
 */

const STORAGE_PREFIX = 'supabase_auth_'

export const chromeStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const storageKey = STORAGE_PREFIX + key
    const result = await chrome.storage.local.get(storageKey)
    return (result[storageKey] as string) ?? null
  },

  async setItem(key: string, value: string): Promise<void> {
    const storageKey = STORAGE_PREFIX + key
    await chrome.storage.local.set({ [storageKey]: value })
  },

  async removeItem(key: string): Promise<void> {
    const storageKey = STORAGE_PREFIX + key
    await chrome.storage.local.remove(storageKey)
  }
}
