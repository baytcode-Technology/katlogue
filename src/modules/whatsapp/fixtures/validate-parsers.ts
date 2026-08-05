/**
 * Validates coexistence webhook parsers against sample Meta payloads.
 * Run: npx tsx src/modules/whatsapp/fixtures/validate-parsers.ts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWebhookFieldEvents } from '../services/coexistence-webhook.service.js'
import { parseWebhookPayload } from '../services/whatsapp.service.js'
import { parseWhatsAppMessageContent } from '../services/whatsapp-message-content.service.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = __dirname

const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'))

let failed = 0

for (const file of files) {
  const payload = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
  const fieldEvents = parseWebhookFieldEvents(payload)
  const legacyEvents = parseWebhookPayload(payload)

  console.log(`\n=== ${file} ===`)
  console.log(`  field events: ${fieldEvents.length}`)
  for (const event of fieldEvents) {
    console.log(
      `    field=${event.field} contacts=${event.contacts.length} history=${event.historyMessages.length} echoes=${event.messageEchoes.length} messages=${event.messages.length}`
    )
    for (const msg of [...event.messages, ...event.historyMessages, ...event.messageEchoes]) {
      console.log(
        `      msg type=${msg.type} preview=${msg.textBody ?? 'null'} mediaId=${msg.mediaId ?? 'null'}`
      )
    }
  }
  console.log(`  legacy message/status changes: ${legacyEvents.length}`)

  if (file === 'image.json') {
    const msg = fieldEvents[0]?.messages[0]
    if (!msg || msg.type !== 'image' || msg.mediaId !== 'media-image-123' || msg.textBody !== 'Product photo') {
      console.error('  FAIL: image message content')
      failed += 1
    }
  }

  if (file === 'reaction.json') {
    const msg = fieldEvents[0]?.messages[0]
    if (!msg || msg.type !== 'reaction' || msg.reactionEmoji !== '👍') {
      console.error('  FAIL: reaction message content')
      failed += 1
    }
  }

  if (fieldEvents.length === 0 && file !== 'messages.json') {
    console.error(`  FAIL: expected at least one field event`)
    failed += 1
  }
}

const stickerContent = parseWhatsAppMessageContent({
  type: 'sticker',
  sticker: { id: 'abc', mime_type: 'image/webp' },
})
if (stickerContent.mediaId !== 'abc' || stickerContent.textBody !== 'Sticker') {
  console.error('\nFAIL: parseWhatsAppMessageContent sticker')
  failed += 1
}

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed validation`)
  process.exit(1)
}

console.log('\nAll coexistence webhook fixtures parsed successfully.')
