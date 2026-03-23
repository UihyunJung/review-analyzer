# Privacy Policy — Place Review Analyzer

**Last updated**: March 23, 2026

## Data Collection

This extension collects minimal data required for review analysis and the premium subscription service:

- **Installation ID**: A randomly generated UUID stored locally. Sent to our backend server to verify subscription status and track daily usage limits. This is not linked to any personal information.
- **Email address**: Only when you voluntarily provide it to restore a purchase on a new device. Used solely for purchase verification via Paddle.
- **Review text**: Temporarily transmitted to our backend server for AI analysis. Never stored on our servers.
- **Analysis results**: Place name, URL, and AI-generated summary stored in analysis history for 90 days.
- **Usage count**: Daily analysis count for free tier limits.

## Local Storage

The extension uses Chrome's `chrome.storage.local` API to save:
- Subscription status (cached locally for offline use)
- Daily usage count (cached)
- Language preference
- Last analysis result

This data is stored on your device and is not transmitted except as described above.

## Third-Party Services

- **Google (Gemini API)**: AI processing of review text. Review text is sent for analysis and not stored. See [Google AI Terms of Service](https://ai.google.dev/terms).
- **Paddle** (paddle.com): Payment processing as Merchant of Record. When you purchase a subscription, Paddle handles all payment data (credit card, billing address) directly. We do not receive or store your payment details. See [Paddle's Privacy Policy](https://www.paddle.com/legal/privacy).
- **Supabase**: Database for usage tracking and analysis history. See [Supabase Privacy Policy](https://supabase.com/privacy).
- **Cloudflare Workers**: API hosting. See [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/).
- **Backend Server** (paddle-extensions-backend.vercel.app): Our server communicates with Paddle to verify subscription status. It receives only your Installation ID and, during purchase restoration, your email address.

This extension does not use any analytics, tracking, or advertising services.

## Data Retention

- Analysis history: 90 days, then auto-deleted.
- Account deletion: All data removed immediately upon request.

## Contact

If you have questions about this privacy policy, please contact: uihyun.jung@gmail.com
