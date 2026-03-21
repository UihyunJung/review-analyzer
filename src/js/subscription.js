import { API_BASE, STORAGE_KEYS } from './config.js'

export async function checkPremium() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.PREMIUM)
  return data[STORAGE_KEYS.PREMIUM] === true
}

export async function getInstallId() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.INSTALL_ID)
  return data[STORAGE_KEYS.INSTALL_ID] || null
}

export async function openCheckout(plan = 'monthly') {
  const installId = await getInstallId()
  if (!installId) throw new Error('Install ID not found')

  const res = await fetch(`${API_BASE}/api/create-checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installId, plan, app: 'review_analyzer' })
  })

  if (!res.ok) throw new Error('Failed to create checkout')

  const data = await res.json()
  if (data.checkoutUrl) {
    chrome.tabs.create({ url: data.checkoutUrl })
  } else {
    throw new Error('No checkout URL returned')
  }
}

export async function restorePurchase(email) {
  const installId = await getInstallId()
  if (!installId) return { restored: false, reason: 'no_install_id' }

  const res = await fetch(`${API_BASE}/api/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toLowerCase().trim(), newInstallId: installId })
  })

  if (!res.ok) {
    if (res.status === 429) return { restored: false, reason: 'cooldown' }
    return { restored: false, reason: 'api_error' }
  }

  const data = await res.json()
  if (data.restored) {
    await refreshStatus()
  }
  return data
}

export async function refreshStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'check-status' }, (response) => {
      resolve({
        premium: response?.premium ?? false,
        planType: response?.planType ?? null,
        expiresAt: response?.expiresAt ?? null,
        status: response?.status ?? null
      })
    })
  })
}
