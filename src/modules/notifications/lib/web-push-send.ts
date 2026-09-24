import webpush from 'web-push'
import { env, isWebPushConfigured } from '../../../config/env.js'
import * as adminWebPushRepository from '../repositories/platform-admin-web-push-subscription.repository.js'
import * as webPushRepository from '../repositories/web-push-subscription.repository.js'

type WebPushEndpointKeys = {
  endpoint: string
  p256dh: string
  auth: string
}

let vapidConfigured = false
let missingVapidLogged = false

function ensureVapid(): boolean {
  if (!isWebPushConfigured()) {
    if (!missingVapidLogged) {
      missingVapidLogged = true
      console.warn('[web-push] VAPID keys not configured — skipping browser push')
    }
    return false
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(
      env.VAPID.SUBJECT!,
      env.VAPID.PUBLIC_KEY!,
      env.VAPID.PRIVATE_KEY!
    )
    vapidConfigured = true
  }

  return true
}

function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410
}

async function deleteStaleEndpoint(endpoint: string): Promise<void> {
  await Promise.all([
    webPushRepository.deleteWebPushSubscriptionByEndpoint(endpoint),
    adminWebPushRepository.deletePlatformAdminWebPushSubscriptionByEndpoint(endpoint),
  ])
}

export async function sendWebPushToSubscriptions(
  subscriptions: WebPushEndpointKeys[],
  payload: {
    title: string
    body: string
    data?: Record<string, string>
  }
): Promise<void> {
  if (subscriptions.length === 0) return
  if (!ensureVapid()) return

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  })

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          body,
          { urgency: 'high' }
        )
      } catch (err) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : undefined

        if (isGoneStatus(statusCode)) {
          await deleteStaleEndpoint(sub.endpoint)
          return
        }

        console.error('[web-push] send failed', sub.endpoint.slice(0, 64), err)
      }
    })
  )
}
