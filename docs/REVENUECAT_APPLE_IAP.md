# RevenueCat + Apple IAP setup (AiShopy Business)

## Product IDs (must match code)
- Subscription product: `aishopy_business_monthly`
- Entitlement: `business`

## 1. App Store Connect
1. Apps → AiShopy → Monetization → Subscriptions
2. Create a subscription group (e.g. `aishopy_business`)
3. Add auto-renewable subscription `aishopy_business_monthly` (1 month)
4. Set App Store price tiers close to ₹999 / $20; add introductory offer for first month (~₹99 / $1) if desired
5. Submit subscription with the next app version for review

## 2. RevenueCat
1. Create project → add iOS app with bundle id `com.aishopy.app`
2. Upload App Store Connect API key / shared secret as RevenueCat requires
3. Import `aishopy_business_monthly` → attach to entitlement `business`
4. Create an Offering (Current) that includes the Business monthly package
5. Copy **Public iOS API key** into EAS (do not leave empty in eas.json):
   ```bash
   eas env:create --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value appl_xxx --environment production --visibility plaintext
   ```
   Also set for preview/development if you use those profiles.
6. Copy **Secret API key** into backend `REVENUECAT_SECRET_API_KEY`
7. Webhooks → Add:
   - URL: `https://api.aishopy.io/api/subscriptions/revenuecat/webhook`
   - Authorization header: e.g. `Bearer rc_wh_your_secret`
   - Set the same value as backend `REVENUECAT_WEBHOOK_AUTH`

## 3. Database
Apply migration `054_revenuecat_webhook_events.sql` on Supabase.

## 4. Deploy & test
1. Deploy backend with the new env vars
2. `eas build --platform ios --profile production` then TestFlight
3. Sandbox Apple ID: Subscription → Subscribe → confirm store becomes Business
4. Use Restore purchases if needed

## App Review notes (paste when resubmitting)
iOS subscriptions use Apple In-App Purchase via RevenueCat for the Business plan. Razorpay checkout is Android/web only. The Enterprise “Let’s Talk” external contact CTA has been removed.
