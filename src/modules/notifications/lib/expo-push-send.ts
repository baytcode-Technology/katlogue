export type ExpoPushMessage = {
  to: string
  title: string
  body: string
  sound?: string
  channelId?: string
  data?: Record<string, string>
  priority?: 'default' | 'normal' | 'high'
}

export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return

  const chunks: ExpoPushMessage[][] = []
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100))
  }

  for (const chunk of chunks) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      })

      if (!res.ok) {
        console.error('[push] Expo API error', res.status, await res.text())
      }
    } catch (err) {
      console.error('[push] Expo API request failed', err)
    }
  }
}
