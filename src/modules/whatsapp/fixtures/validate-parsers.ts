/**
 * Validates coexistence webhook parsers against sample Meta payloads.
 * Run: npx tsx src/modules/whatsapp/fixtures/validate-parsers.ts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWebhookFieldEvents } from '../services/coexistence-webhook.service.js'
import { parseWebhookPayload } from '../services/whatsapp.service.js'

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
  }
  console.log(`  legacy message/status changes: ${legacyEvents.length}`)

  if (fieldEvents.length === 0 && file !== 'messages.json') {
    console.error(`  FAIL: expected at least one field event`)
    failed += 1
  }
}

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed validation`)
  process.exit(1)
}

console.log('\nAll coexistence webhook fixtures parsed successfully.')
