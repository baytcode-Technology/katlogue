/**
 * Gemini inbox agent: the model picks tool calls; code owns facts.
 * Run: npx tsx src/modules/inbox-ai/fixtures/agent.fixture.ts
 */
import assert from 'node:assert/strict'
import type { LlmToolCall, LlmToolDefinition } from '../../../shared/llm/types.js'
import type { Store } from '../../stores/types/store.types.js'
import type { OrderWithDetails } from '../../orders/repositories/order.repository.js'
import type { CatalogMatch } from '../services/catalog-search.service.js'
import type { Product } from '../../products/types/product.types.js'
import { replyUsesOnlyToolFacts } from '../agent/agent-guard.js'
import { buildInboxAgentSystemPrompt } from '../agent/inbox-agent-prompt.js'
import { runInboxAgent } from '../agent/run-inbox-agent.js'

let failed = 0

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ok ${name}`)
    })
    .catch((err: unknown) => {
      failed += 1
      console.error(`  FAIL ${name}:`, err instanceof Error ? err.message : err)
    })
}

const store = {
  id: 1,
  name: 'Shrox',
  slug: 'shrox',
  currency: 'INR',
  country: 'IN',
  shop_policies: {},
  payment_config: {},
  custom_domain: null,
  custom_domain_status: null,
} as unknown as Store

function catalogMatch(id: number, name: string, price: number): CatalogMatch {
  return {
    product: { id, name, images: [], thumbnail_url: null, sku: null } as unknown as Product,
    variant: null,
    price,
    url: `https://shrox.aishopy.io/product/${name.toLowerCase().replace(/\s+/g, '-')}-${id}`,
    score: 90,
    inStock: true,
    categoryName: 'Shirt',
  }
}

const checkShirt = catalogMatch(9, 'Check Shirt', 499)
const linenShirt = catalogMatch(8, 'Linen Shirt', 566)

function checkOrder(): OrderWithDetails {
  return {
    id: 3,
    store_id: 1,
    order_number: 'JAN26-3',
    order_status: 'confirmed',
    payment_status: 'paid',
    fulfillment_status: 'unfulfilled',
    total: 499,
    created_at: '2026-01-21T10:00:00.000Z',
    tracking_number: null,
    tracking_url: null,
    courier_name: null,
    promised_by: null,
    delay_note: null,
    payment: null,
    items: [
      {
        id: 3,
        snapshot: { product: { name: 'Check Shirt' } },
      },
    ],
  } as unknown as OrderWithDetails
}

type Completer = (
  systemPrompt: string,
  history: { role: string; content: string }[],
  tools: LlmToolDefinition[],
  runTool: (call: LlmToolCall) => Promise<unknown>
) => Promise<string>

async function main(): Promise<void> {
  console.log('\n=== Inbox agent ===')

  await test('check shirt search keeps the style word and shows Check Shirt', async () => {
    let query = ''
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'hi njan oru check shirt undo',
      recentMessages: [],
      customerPhone: '919999999999',
      conversationId: 11,
      shopSells: ['Shirt'],
      deps: {
        searchCatalog: async (_storeId, _slug, _currency, filters) => {
          query = typeof filters === 'string' ? filters : filters.query
          return [checkShirt, linenShirt]
        },
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        const found = (await runTool({
          name: 'search_products',
          args: { query: 'check shirt' },
        })) as { products: Array<{ productId: number; name: string }> }
        const check = found.products.find((row) => row.name === 'Check Shirt')
        assert.ok(check)
        await runTool({ name: 'show_product', args: { productId: check.productId } })
        return 'Yes sir, ithu nokku.'
      }) as Completer,
    })
    assert.equal(query, 'check shirt')
    assert.equal(result?.reply.primaryMatch?.product.name, 'Check Shirt')
    assert.match(result?.reply.primaryText ?? '', /Yes sir, ithu nokku/)
    assert.match(result?.reply.primaryText ?? '', /Check Shirt/)
    assert.doesNotMatch(result?.reply.primaryText ?? '', /^Ind saar/i)
  })

  await test('order lookup keeps check shirt, not every shirt', async () => {
    let hint = ''
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'where is my check shirt order',
      recentMessages: [],
      customerPhone: '919999999999',
      conversationId: 11,
      shopSells: ['Shirt'],
      deps: {
        collectOrders: async (input) => {
          hint = input.intent.orderProductHint ?? ''
          return [checkOrder()]
        },
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({
          name: 'get_my_orders',
          args: { scope: 'product', productHint: 'check shirt' },
        })
        return 'Your check shirt order JAN26-3 is still unfulfilled.'
      }) as Completer,
    })
    assert.equal(hint, 'check shirt')
    assert.match(result?.reply.primaryText ?? '', /JAN26-3/)
    assert.equal(result?.reply.primaryMatch, null)
  })

  await test('an invented price is rejected', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'check shirt price',
      recentMessages: [],
      customerPhone: null,
      conversationId: null,
      shopSells: ['Shirt'],
      deps: {
        searchCatalog: async () => [checkShirt],
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'check shirt' } })
        return 'It is ₹999 sir.'
      }) as Completer,
    })
    assert.equal(result, null)
    assert.equal(replyUsesOnlyToolFacts('It is ₹999', '₹499'), false)
    assert.equal(replyUsesOnlyToolFacts('It is ₹499', '₹499'), true)
  })

  await test('yes after our offer is checkout steps, not a placed order', async () => {
    const offerUrl = 'https://shrox.aishopy.io/product/check-shirt-9?variant=23'
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'yes',
      recentMessages: [
        {
          role: 'store',
          text: `Yes sir, ithu nokku.\n${offerUrl}\nOrder cheyyano sir?`,
        },
      ],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt'],
      completeWithTools: (async () =>
        `Open this link, confirm quantity, then pay there.\n${offerUrl}`) as Completer,
    })
    assert.match(result?.reply.primaryText ?? '', /confirm quantity/i)
    assert.match(result?.reply.primaryText ?? '', /check-shirt-9/)
    assert.doesNotMatch(result?.reply.primaryText ?? '', /order is placed|thank you for your order/i)
    assert.equal(result?.reply.primaryMatch, null)
  })

  await test('salesman prompt uses this shop and refuses weather or code help', () => {
    const prompt = buildInboxAgentSystemPrompt({
      storeName: 'Shrox',
      homeUrl: 'https://shrox.aishopy.io',
      departments: ['Mixers'],
      customerLanguage: 'English',
      storeDescription: 'We repair and sell kitchen mixers.',
      ownerNotes: 'Always offer a demo if they ask.',
    })
    assert.match(prompt, /salesman of "Shrox"/)
    assert.match(prompt, /kitchen mixers/)
    assert.match(prompt, /Mixers/)
    assert.match(prompt, /Always offer a demo/)
    assert.match(prompt, /never let you invent a price/)
    assert.match(prompt, /Weather, news, homework/)
    assert.match(prompt, /fix this code/)
    assert.match(prompt, /Do not answer them/)
  })

  await test('cancel calls connect_helpline', async () => {
    let reason = ''
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'please cancel my order',
      recentMessages: [],
      customerPhone: '919999999999',
      conversationId: 11,
      shopSells: ['Shirt'],
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        const args = { reason: 'cancel' }
        reason = args.reason
        await runTool({ name: 'connect_helpline', args })
        return 'Our customer helpline will contact you sir. Please wait in this chat.'
      }) as Completer,
    })
    assert.equal(reason, 'cancel')
    assert.equal(result?.staffHandoff, 'warn')
    assert.match(result?.reply.primaryText ?? '', /helpline/i)
  })

  if (failed > 0) {
    console.error(`\n${failed} agent fixture(s) failed`)
    process.exit(1)
  }
  console.log('\nAll inbox agent fixtures passed.')
}

void main()
