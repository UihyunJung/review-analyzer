import { useEffect, useState } from 'react'

import type { UsageData } from '~lib/types'
import { EDGE_FUNCTION_URL, FREE_DAILY_LIMIT, SUPABASE_URL } from '~lib/constants'
import { getCurrentUser, getAccessToken, signIn, signUp, signOut } from '~lib/api/supabase'
import type { User } from '@supabase/supabase-js'

import './popup.css'

function AuthForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      if (isSignUp) {
        await signUp(email, password)
        setMessage('Check your email to confirm your account')
      } else {
        await signIn(email, password)
        onSuccess()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-form">
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="auth-input"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="auth-input"
        />
        <button type="submit" disabled={loading} className="auth-submit">
          {loading ? '...' : isSignUp ? 'Sign Up' : 'Sign In'}
        </button>
      </form>
      {error && <p className="auth-error">{error}</p>}
      {message && <p className="auth-message">{message}</p>}
      <button onClick={() => setIsSignUp(!isSignUp)} className="auth-toggle">
        {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
      </button>
    </div>
  )
}

function Popup() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(!SUPABASE_URL) // Supabase 미설정 시 바로 대시보드
  const [showAuth, setShowAuth] = useState(false)
  const [usage, setUsage] = useState<UsageData>({
    count: 0,
    limit: FREE_DAILY_LIMIT,
    isPro: false,
    remaining: FREE_DAILY_LIMIT
  })
  const [syncing, setSyncing] = useState(true)

  useEffect(() => {
    // 사용량 로드
    chrome.runtime.sendMessage({ type: 'GET_USAGE' }, (response) => {
      if (response?.success && response.data) setUsage(response.data)
      setSyncing(false)
    })

    // 인증 상태 확인 (Supabase 설정된 경우만)
    if (SUPABASE_URL) {
      getCurrentUser()
        .then((u) => {
          setUser(u)
          setAuthReady(true)
        })
        .catch(() => setAuthReady(true))
    }
  }, [])

  const handleSignOut = async () => {
    await signOut()
    setUser(null)
    setShowAuth(false)
  }

  const handleUpgrade = async () => {
    if (!user) {
      setShowAuth(true)
      return
    }

    try {
      const token = await getAccessToken()
      if (!token) {
        setShowAuth(true)
        return
      }

      // 체크아웃 토큰 발급
      const res = await fetch(`${EDGE_FUNCTION_URL}/checkout-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: user.email })
      })

      const data = await res.json()
      if (data.success && data.token) {
        const checkoutUrl =
          process.env.PLASMO_PUBLIC_CHECKOUT_URL ?? 'https://placeholder.github.io/checkout'
        chrome.tabs.create({
          url: `${checkoutUrl}?token=${data.token}&plan=monthly`
        })
      }
    } catch {
      // 실패 시 무시
    }
  }

  const percentage = (usage.count / usage.limit) * 100
  const exceeded = usage.remaining <= 0 && !usage.isPro

  return (
    <div className="popup">
      <header className="popup-header">
        <div className="header-row">
          <h1>Place Review Analyzer</h1>
          {authReady && !user && SUPABASE_URL && (
            <button onClick={() => setShowAuth(!showAuth)} className="auth-link">
              Sign in
            </button>
          )}
          {user && (
            <button onClick={handleSignOut} className="auth-link">
              Sign out
            </button>
          )}
        </div>
        {user ? (
          <p className="subtitle">{user.email}</p>
        ) : (
          <p className="subtitle">AI-powered restaurant insights</p>
        )}
      </header>

      {showAuth && !user && (
        <AuthForm
          onSuccess={() => {
            getCurrentUser().then((u) => {
              setUser(u)
              setShowAuth(false)
            })
          }}
        />
      )}

      <section className={`usage-section ${exceeded ? 'usage-exceeded' : ''}`}>
        <div className="usage-label">
          <span>{syncing ? 'Syncing...' : "Today's usage"}</span>
          <span className="usage-count">
            {usage.count} / {usage.limit}
          </span>
        </div>
        <div className="usage-bar">
          <div
            className={`usage-fill ${exceeded ? 'usage-fill-exceeded' : ''}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <p className="usage-remaining">
          {exceeded
            ? 'Daily limit reached \u2014 upgrade for unlimited'
            : `${usage.remaining} analyses remaining`}
        </p>
        <p className="usage-reset">Resets daily at midnight UTC</p>
      </section>

      {!usage.isPro && (
        <section className="pro-cta">
          <p>
            {exceeded
              ? 'Unlock unlimited analyses now'
              : 'Unlock unlimited analyses + place comparison'}
          </p>
          <button className="pro-button" onClick={handleUpgrade}>
            {user ? 'Upgrade to Pro \u2014 $3.99/mo' : 'Sign in to Upgrade'}
          </button>
        </section>
      )}

      {usage.isPro && (
        <section className="pro-active">
          <span className="pro-badge">PRO</span>
          <span>Unlimited analyses active</span>
        </section>
      )}

      {!user && !showAuth && SUPABASE_URL && (
        <p className="guest-note">
          Using as guest.{' '}
          <button onClick={() => setShowAuth(true)} className="auth-link-inline">
            Sign in
          </button>{' '}
          to sync across devices.
        </p>
      )}

      <footer className="popup-footer">
        <p className="supported">Currently supports google.com/maps only</p>
      </footer>
    </div>
  )
}

export default Popup
