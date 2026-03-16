// Place Review Analyzer — Checkout Page
// Loaded on external GitHub Pages, not inside the extension (MV3 CSP).

const API_URL = '' // Set to Workers URL before deployment, e.g. https://place-review-api.xxx.workers.dev

// Paddle price IDs (set after creating products in Paddle)
const PRICE_IDS = {
  monthly: 'pri_monthly_placeholder',
  annual: 'pri_annual_placeholder'
}

let selectedPlan = 'monthly'
let verifiedUserId = null
let verifiedEmail = null

// --- URL params ---
const params = new URLSearchParams(window.location.search)
const token = params.get('token')
const planParam = params.get('plan')
if (planParam === 'annual') {
  selectedPlan = 'annual'
}

// --- Init ---
async function init() {
  if (!token) {
    showError()
    return
  }

  try {
    // 서버에서 토큰 검증
    const res = await fetch(API_URL + '/verify-checkout-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })

    if (!res.ok) {
      showError()
      return
    }

    const data = await res.json()
    if (!data.success || !data.userId) {
      showError()
      return
    }

    verifiedUserId = data.userId
    verifiedEmail = data.email || ''

    // 성공: 메인 UI 표시
    document.getElementById('content-loading').style.display = 'none'
    document.getElementById('content-main').style.display = 'block'

    // 플랜 선택 반영
    selectPlan(selectedPlan)

    // Paddle 초기화
    if (typeof Paddle !== 'undefined') {
      Paddle.Initialize({
        token: 'test_placeholder' // Paddle client token (배포 시 실제 값으로 교체)
      })
    }
  } catch {
    showError()
  }
}

function showError() {
  document.getElementById('content-loading').style.display = 'none'
  document.getElementById('content-error').style.display = 'block'
}

function selectPlan(plan) {
  selectedPlan = plan
  document.getElementById('plan-monthly').classList.toggle('selected', plan === 'monthly')
  document.getElementById('plan-annual').classList.toggle('selected', plan === 'annual')
}

async function startCheckout() {
  const btn = document.getElementById('checkout-btn')
  btn.disabled = true
  btn.textContent = 'Loading...'

  try {
    if (typeof Paddle === 'undefined') {
      throw new Error('Paddle not loaded')
    }

    Paddle.Checkout.open({
      items: [{ priceId: PRICE_IDS[selectedPlan] }],
      customData: { userId: verifiedUserId },
      customer: { email: verifiedEmail },
      successCallback: () => {
        document.getElementById('content-main').style.display = 'none'
        document.getElementById('content-success').style.display = 'block'
      },
      closeCallback: () => {
        btn.disabled = false
        btn.textContent = 'Subscribe Now'
      }
    })
  } catch (err) {
    const errorEl = document.getElementById('error-msg')
    errorEl.textContent = err.message || 'Failed to open checkout'
    errorEl.style.display = 'block'
    btn.disabled = false
    btn.textContent = 'Subscribe Now'
  }
}

// 페이지 로드 시 실행
init()
