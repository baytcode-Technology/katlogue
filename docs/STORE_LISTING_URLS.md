# Store listing URLs (Privacy & Terms)

Public legal pages (after deploying `AiShopy_LandingPage`):

| Page | URL |
|---|---|
| Privacy Policy | https://www.aishopy.io/privacy |
| Terms of Use | https://www.aishopy.io/terms |

## App Store Connect (fixes Guideline 3.1.2)

1. **App Information** → **Privacy Policy URL**: `https://www.aishopy.io/privacy`
2. **Version 1.0** → **Description** (append at bottom):

```
Terms of Use: https://www.aishopy.io/terms
Privacy Policy: https://www.aishopy.io/privacy
```

3. **Update Review** → **Resubmit** (same build 1.0.2 (3) is fine)

## Google Play Console

1. **App content** → **Privacy policy**: `https://www.aishopy.io/privacy`
2. **Data safety**: confirm “Data encrypted in transit” matches HTTPS usage
3. **Production release**: Send for review (deobfuscation warning is non-blocking)

## Deploy landing site

Deploy `AiShopy_LandingPage` to the host serving `aishopy.io`, then verify both URLs open in Safari without login.
