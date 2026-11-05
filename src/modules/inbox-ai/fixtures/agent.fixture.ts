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
import { replyUsesOnlyToolFacts, sanitizeAgentSpoken } from '../agent/agent-guard.js'
import { buildInboxAgentSystemPrompt } from '../agent/inbox-agent-prompt.js'
import { cleanSearchQuery, matchShopDepartment } from '../agent/inbox-agent-tools.js'
import { runInboxAgent } from '../agent/run-inbox-agent.js'
import { scoreProduct } from '../services/catalog-search.service.js'

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
const trousers = {
  ...catalogMatch(19, 'Men Loose Fit Brown Lycra Blend Trousers', 499),
  categoryName: 'Pants',
}
const mixer = {
  ...catalogMatch(31, 'Kitchen Mixer', 1299),
  categoryName: 'Mixers',
}

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

  await test('markdown links are stripped; English helpdesk is rejected for Manglish', async () => {
    assert.equal(
      sanitizeAgentSpoken(
        'We have a Check Shirt [here](https://shrox.aishopy.io/product/check-shirt-9).',
        { stripUrls: true }
      ),
      'We have a Check Shirt .'
    )
    const manglish = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'hi njan oru check shirt undo',
      recentMessages: [],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt'],
      deps: { searchCatalog: async () => [checkShirt] },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'check shirt' } })
        await runTool({ name: 'show_product', args: { productId: 9 } })
        return 'Yes sir, ithu nokku. [here](https://shrox.aishopy.io/product/check-shirt-9)'
      }) as Completer,
    })
    assert.match(manglish?.reply.primaryText ?? '', /Yes sir, ithu nokku/)
    assert.doesNotMatch(manglish?.reply.primaryText ?? '', /\[here\]\(/)
    assert.match(manglish?.reply.primaryText ?? '', /check-shirt-9/)

    const helpdesk = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'hi njan oru check shirt undo',
      recentMessages: [],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt'],
      deps: { searchCatalog: async () => [checkShirt] },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'check shirt' } })
        await runTool({ name: 'show_product', args: { productId: 9 } })
        return 'How can I assist you today at Shrox?'
      }) as Completer,
    })
    assert.equal(helpdesk, null)
  })

  await test('other colour shirts searches shirt and shows a different card', async () => {
    let query = ''
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'vere ethelum colour shirts undo',
      recentMessages: [
        {
          role: 'store',
          text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/check-shirt-9`,
        },
      ],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt'],
      deps: {
        searchCatalog: async (_storeId, _slug, _currency, filters) => {
          query = typeof filters === 'string' ? filters : filters.query
          return [checkShirt, linenShirt]
        },
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'colour shirts' } })
        return 'Vere colour shirt um und sir.'
      }) as Completer,
    })
    assert.equal(cleanSearchQuery('colour shirts'), 'shirts')
    assert.equal(query, 'shirts')
    assert.equal(result?.reply.primaryMatch?.product.name, 'Linen Shirt')
    assert.match(result?.reply.primaryText ?? '', /Vere colour shirt um und/)
    assert.doesNotMatch(result?.reply.primaryText ?? '', /\[here\]\(/)
  })

  await test('pants query uses this shop Pants department and shows Trousers', async () => {
    assert.equal(matchShopDepartment('pants', ['Pants', 'Shirt']), 'Pants')
    let categoryName: string | null | undefined
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Pants vehnam',
      recentMessages: [],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Pants', 'Shirt'],
      deps: {
        searchCatalog: async (_storeId, _slug, _currency, filters) => {
          categoryName = typeof filters === 'string' ? null : filters.categoryName
          return [trousers, linenShirt]
        },
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        const found = (await runTool({
          name: 'search_products',
          args: { query: 'pants' },
        })) as { products: Array<{ name: string }> }
        assert.ok(found.products.some((row) => /trousers/i.test(row.name)))
        await runTool({ name: 'show_product', args: { productId: 19 } })
        return 'Yes sir, ithu nokku. Pant und.'
      }) as Completer,
    })
    assert.equal(categoryName, 'Pants')
    assert.match(result?.reply.primaryMatch?.product.name ?? '', /Trousers/i)
  })

  await test('mixie matches this shop Mixer name stem, not clothing', () => {
    assert.ok(scoreProduct({ name: 'Kitchen Mixer', description: null }, 'mixie') >= 40)
    assert.equal(scoreProduct({ name: 'Linen Shirt', description: null }, 'mixie'), 0)
  })

  await test('empty search returns shop names and does not invent a website error', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'oru banyan undo',
      recentMessages: [],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Mixers'],
      deps: {
        searchCatalog: async () => [],
        getStoreCatalogSummary: async () => ({
          productNames: ['Kitchen Mixer'],
          categoryNames: ['Mixers'],
        }),
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        const found = (await runTool({
          name: 'search_products',
          args: { query: 'banyan' },
        })) as { products: unknown[]; departments: string[]; closeNames: string[] }
        assert.equal(found.products.length, 0)
        assert.ok(found.departments.includes('Mixers'))
        assert.ok(found.closeNames.includes('Kitchen Mixer'))
        return 'Banyan ee shopil illa sir. Mixers aanu ullath.'
      }) as Completer,
    })
    assert.match(result?.reply.primaryText ?? '', /Mixers/)
    assert.doesNotMatch(result?.reply.primaryText ?? '', /website|helpline|error/i)
  })

  await test('product complaint does not look up orders', async () => {
    const called: string[] = []
    await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Currently ith evidunn vann ippo alle illann vanne',
      recentMessages: [
        {
          role: 'store',
          text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/men-loose-fit-brown-lycra-blend-trousers-19`,
        },
      ],
      customerPhone: '919999999999',
      conversationId: 11,
      shopSells: ['Pants'],
      deps: {
        searchCatalog: async () => [trousers],
        collectOrders: async () => [checkOrder()],
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        called.push('search_products')
        await runTool({ name: 'search_products', args: { query: 'pants' } })
        await runTool({ name: 'show_product', args: { productId: 19 } })
        return 'Yes sir, pant ippo und. Ithu nokku.'
      }) as Completer,
    })
    assert.ok(called.includes('search_products'))
    assert.equal(called.includes('get_my_orders'), false)
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
    assert.match(prompt, /How can I assist you/)
    assert.match(prompt, /other colour/)
    assert.match(prompt, /No markdown, no \[here\]\(url\)/)
    assert.match(prompt, /closeNames/)
    assert.match(prompt, /website is wrong/)
    assert.match(prompt, /already placed/)
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
