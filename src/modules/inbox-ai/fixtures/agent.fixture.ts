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
import { detectLanguageAndScript } from '../../../shared/lib/detect-language-script.js'
import { replyUsesOnlyToolFacts, sanitizeAgentSpoken } from '../agent/agent-guard.js'
import { buildInboxAgentSystemPrompt } from '../agent/inbox-agent-prompt.js'
import {
  cleanSearchQuery,
  looksLikePlacedOrderAsk,
  matchAllShopDepartments,
  matchShopDepartment,
  stayOnLastProduct,
  wantsAlsoList,
  wantsOptionPhotos,
  wantsOtherModels,
  wantsWholeStoreShare,
} from '../agent/inbox-agent-tools.js'
import { runInboxAgent } from '../agent/run-inbox-agent.js'
import { buildVariantBoard, scoreProduct } from '../services/catalog-search.service.js'
import type { ProductVariant } from '../../products/types/product-variant.types.js'

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
    product: {
      id,
      name,
      images: [`https://img.example/${id}.jpg`],
      thumbnail_url: `https://img.example/${id}.jpg`,
      sku: null,
    } as unknown as Product,
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

function variantOf(
  match: CatalogMatch,
  id: number,
  name: string,
  options: Record<string, unknown>
): CatalogMatch {
  return {
    ...match,
    variant: {
      id,
      product_id: match.product.id,
      name,
      options,
      price_delta: 0,
      compare_at_price: null,
      stock_qty: 1,
      mark_as_sold: false,
      mark_as_non_inventory: false,
      sku: null,
      image_url: `https://img.example/${id}.jpg`,
      is_active: true,
      sort_order: 0,
    } as ProductVariant,
    url: `${match.url.split('?')[0]}?variant=${id}`,
  }
}

const lycra28 = variantOf(trousers, 91, '28 / Chocolate Brown', {
  Size: '28',
  Color: 'Chocolate Brown',
})
const lycra30 = variantOf(trousers, 97, '30 / Black', { Size: '30', Color: 'Black' })
const relaxed = {
  ...catalogMatch(20, 'Relaxed Men White Cotton Blend Trousers', 469),
  categoryName: 'Pants',
}

const lycraCard = {
  role: 'store' as const,
  text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/men-loose-fit-brown-lycra-blend-trousers-19`,
}
const lycraAlso = {
  role: 'store' as const,
  text: `Ithupole vereyum ind:\n\n• Relaxed Men White Cotton Blend Trousers — ₹469\n  https://shrox.aishopy.io/product/relaxed-men-white-cotton-blend-trousers-20`,
}

function productWithVariants(base: CatalogMatch, variants: CatalogMatch[]): CatalogMatch {
  const active = variants
    .map((row) => row.variant)
    .filter((row): row is ProductVariant => row != null)
  return {
    ...base,
    activeVariants: active,
    variantBoard: buildVariantBoard(base.product, active),
  }
}

const metroBase = {
  ...catalogMatch(18, 'METRONAUT Men Regular Fit Striped Spread Collar Casual Shirt', 399),
  categoryName: 'Shirt',
}
const metroGreen = variantOf(metroBase, 82, 'S / Light Green', { Colour: 'Light Green', Size: 'S' })
const metroBlue = variantOf(metroBase, 83, 'S / Sky Blue', { Colour: 'Sky Blue', Size: 'S' })
const metroYellow = variantOf(metroBase, 84, 'S / Yellow', { Colour: 'Yellow', Size: 'S' })
const metroShirt = productWithVariants(metroGreen, [metroGreen, metroBlue, metroYellow])

const phoneBase = {
  ...catalogMatch(40, 'Shop Phone X', 12999),
  categoryName: 'Phones',
}
const phone8 = variantOf(phoneBase, 401, '8GB', { RAM: '8GB' })
const phone12 = variantOf(phoneBase, 402, '12GB', { RAM: '12GB' })
const phoneX = productWithVariants(phone8, [phone8, phone12])
const tshirt = {
  ...catalogMatch(4, 'Printed T Shirt', 299),
  categoryName: 'T Shirt',
}

function completedOrder(): OrderWithDetails {
  return {
    ...checkOrder(),
    id: 5,
    order_number: 'NOV26-5',
    order_status: 'completed',
    payment_status: 'paid',
    fulfillment_status: 'fulfilled',
    promised_by: '2026-11-11',
    items: [
      {
        id: 5,
        snapshot: { product: { name: 'Men Loose Fit Brown Lycra Blend Trousers' } },
      },
    ],
  } as unknown as OrderWithDetails
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
    assert.equal(result?.reply.primaryMatch?.product.name, 'Check Shirt')
    assert.doesNotMatch(result?.reply.primaryText ?? '', /₹999/)
    assert.match(result?.reply.primaryText ?? '', /₹499/)
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
    assert.equal(helpdesk?.reply.primaryMatch?.product.name, 'Check Shirt')
    assert.match(helpdesk?.reply.primaryText ?? '', /ithu nokku/)
    assert.doesNotMatch(helpdesk?.reply.primaryText ?? '', /How can I assist/)
  })

  await test('stayOnLastProduct keeps the card until they name a new type', () => {
    const sells = ['Shirt', 'Pants']
    assert.equal(stayOnLastProduct('Vere colour available aahna', 'Check Shirt', sells), true)
    assert.equal(stayOnLastProduct('3 piece price korayuvo', 'Men Loose Fit Brown Lycra Blend Trousers', sells), true)
    assert.equal(stayOnLastProduct('book cheytha eppoyathekk deliver aavum', 'Check Shirt', sells), true)
    assert.equal(stayOnLastProduct('vere ethelum colour shirts undo', 'Check Shirt', sells), false)
    assert.equal(stayOnLastProduct('pants vehnam', 'Check Shirt', sells), false)
    assert.equal(
      stayOnLastProduct(
        'Ith size 28 alle enick vendath 30 aahn available ahno',
        'Men Loose Fit Brown Lycra Blend Trousers',
        sells
      ),
      true
    )
    assert.equal(
      stayOnLastProduct(
        '30 size available aayittolla model okke ayack',
        'Men Loose Fit Brown Lycra Blend Trousers',
        sells
      ),
      false
    )
    assert.equal(wantsOtherModels('30 size available aayittolla model okke ayack'), true)
    assert.equal(wantsOtherModels('Shirtil olla model ella share cheyy with details'), true)
    assert.equal(wantsOtherModels('Mensinye enthokke item und details share cheyy'), true)
    assert.deepEqual(matchAllShopDepartments('Yes shirt and t shirt model', ['Shirt', 'T Shirt', 'Pants']), [
      'Shirt',
      'T Shirt',
    ])
    assert.equal(
      wantsAlsoList('Yes shirt and t shirt model', null, ['Shirt', 'T Shirt', 'Pants']),
      true
    )
    assert.equal(looksLikePlacedOrderAsk('book cheytha eppoyathekk deliver aavum'), false)
    assert.equal(looksLikePlacedOrderAsk('where is my order JAN26-3'), true)
    assert.equal(looksLikePlacedOrderAsk('ente last order enthayi'), true)
    assert.equal(looksLikePlacedOrderAsk('ente ella order detailsum onn share cheyy'), true)
    assert.equal(looksLikePlacedOrderAsk('Status please'), true)
    assert.equal(looksLikePlacedOrderAsk('order cheyam eathra days avum kittan'), false)
    assert.equal(wantsOtherModels('vere models indo'), true)
    assert.equal(stayOnLastProduct('vere models indo', 'Check Shirt', sells), false)
  })

  await test('other colour of last card stays on that product', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Vere colour available aahna',
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
          const query = typeof filters === 'string' ? filters : filters.query
          if (/linen/i.test(query)) return [linenShirt]
          return [checkShirt, linenShirt]
        },
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'colour shirts' } })
        await runTool({ name: 'show_product', args: { productId: 8 } })
        return 'Linen shirt um und sir.'
      }) as Completer,
    })
    assert.equal(result?.reply.primaryMatch?.product.name, 'Check Shirt')
    assert.match(result?.reply.primaryText ?? '', /ithu nokku|Check Shirt/i)
    assert.doesNotMatch(result?.reply.primaryText ?? '', /Linen/i)
    assert.equal(result?.reply.followUpText, null)
  })

  await test('size follow-up stays on the primary card not the also-list', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Ith size 28 alle enick vendath 30 aahn available ahno',
      recentMessages: [lycraCard, lycraAlso],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Pants', 'Shirt'],
      deps: {
        searchCatalog: async (_storeId, _slug, _currency, filters) => {
          const size = typeof filters === 'string' ? '' : filters.size
          if (size === '30') return [relaxed, lycra30]
          return [lycra28, relaxed]
        },
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'size 30 pants' } })
        await runTool({ name: 'show_product', args: { productId: 20 } })
        return 'Ee Relaxed trousers 30 size available alla.'
      }) as Completer,
    })
    assert.match(result?.reply.primaryMatch?.product.name ?? '', /Lycra Blend Trousers/i)
    assert.match(result?.reply.primaryMatch?.variant?.name ?? '', /30/)
    assert.doesNotMatch(result?.reply.primaryMatch?.product.name ?? '', /Relaxed/)
    assert.equal(result?.reply.followUpText, null)
  })

  await test('ith mathi discount stays on the primary card', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Aah ith mathi 2 ennam eduthal discount vallom undo',
      recentMessages: [
        {
          role: 'store',
          text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/men-loose-fit-brown-lycra-blend-trousers-19?variant=97`,
        },
        lycraAlso,
      ],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Pants', 'Shirt'],
      deps: {
        searchCatalog: async () => [relaxed, lycra30],
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'discount trousers' } })
        await runTool({ name: 'show_product', args: { productId: 20 } })
        return 'Ee Relaxed Men White Cotton Blend Trousers enthayalum vere chodyam undo?'
      }) as Completer,
    })
    assert.match(result?.reply.primaryMatch?.product.name ?? '', /Lycra Blend Trousers/i)
    assert.doesNotMatch(result?.reply.primaryMatch?.product.name ?? '', /Relaxed/)
  })

  await test('all models with this size may show another listing', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: '30 size available aayittolla model okke ayack',
      recentMessages: [lycraCard, lycraAlso],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Pants', 'Shirt'],
      deps: {
        searchCatalog: async () => [relaxed, lycra30],
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'pants', size: '30' } })
        await runTool({ name: 'show_product', args: { productId: 20 } })
        return 'Ithupole vereyum pants und sir.'
      }) as Completer,
    })
    assert.equal(result?.reply.primaryMatch?.product.name, 'Relaxed Men White Cotton Blend Trousers')
  })

  await test('Manglish colour follow-up is not answered in English', async () => {
    assert.equal(
      detectLanguageAndScript('Ee oru colour mathre ollo appo').language,
      'Malayalam'
    )
    assert.equal(
      sanitizeAgentSpoken('Check shirt available. Link ithu : . Order cheyyano?', { stripUrls: true }),
      'Check shirt available. Order cheyyano?'
    )
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Ee oru colour mathre ollo appo',
      recentMessages: [
        { role: 'customer', text: 'hi njan oru check shirt undo' },
        {
          role: 'store',
          text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/check-shirt-9`,
        },
      ],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt'],
      deps: { searchCatalog: async () => [checkShirt] },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'check shirt' } })
        await runTool({ name: 'show_product', args: { productId: 9 } })
        return 'Yes, this check shirt is available in only this colour. If you want to order, please use the link provided.'
      }) as Completer,
    })
    assert.doesNotMatch(result?.reply.primaryText ?? '', /available in only this colour/i)
    assert.match(result?.reply.primaryText ?? '', /ithu nokku|illa|und/i)
  })

  await test('other colour of this listing uses the variant board', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Ithinte vere colour onda',
      recentMessages: [
        {
          role: 'store',
          text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/metronaut-men-regular-fit-striped-spread-collar-casual-shirt-18`,
        },
      ],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt', 'T Shirt'],
      deps: { searchCatalog: async () => [metroShirt] },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        const found = (await runTool({
          name: 'search_products',
          args: { query: 'colour' },
        })) as { products: Array<{ optionValues?: Record<string, string[]> }> }
        assert.ok(found.products[0]?.optionValues?.Colour?.includes('Sky Blue'))
        await runTool({ name: 'show_product', args: { productId: 18 } })
        return 'Ithinte vere colour illa sir, Light Green mathram und.'
      }) as Completer,
    })
    assert.match(result?.reply.primaryMatch?.product.name ?? '', /METRONAUT/i)
    assert.match(result?.reply.primaryText ?? '', /Sky Blue/i)
    assert.match(result?.reply.primaryText ?? '', /Yellow/i)
    assert.doesNotMatch(result?.reply.primaryText ?? '', /mathram/)
  })

  await test('option photos queue extra cards of the same listing', async () => {
    assert.equal(wantsOptionPhotos('3nteyum photo ayack'), true)
    assert.equal(wantsOptionPhotos('Okay enne oro colour vech ayack'), true)
    assert.equal(wantsOptionPhotos('30 size available aayittolla model okke ayack'), false)
    const metroRecent = [
      {
        role: 'store' as const,
        text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/metronaut-men-regular-fit-striped-spread-collar-casual-shirt-18`,
      },
    ]
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: '3nteyum photo ayack',
      recentMessages: metroRecent,
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt', 'Pants', 'T Shirt'],
      deps: { searchCatalog: async () => [metroShirt] },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: '3nteyum' } })
        return '3nteyum ayack ippo nammal sell cheyyunnilla sir.'
      }) as Completer,
    })
    assert.match(result?.reply.primaryMatch?.product.name ?? '', /METRONAUT/i)
    assert.ok((result?.reply.extraCards?.length ?? 0) >= 2)
    assert.ok(
      result?.reply.extraCards?.every((card) =>
        /metronaut|18|sky blue|yellow|light green/i.test(card.caption)
      )
    )
    assert.doesNotMatch(result?.reply.primaryText ?? '', /sell cheyyunnilla|Shirt, Pants/)
  })

  await test('striped identity does not dump unrelated shirts', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Stripp model shirts unda',
      recentMessages: [
        {
          role: 'store',
          text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/linen-shirt-8`,
        },
      ],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt'],
      deps: {
        searchCatalog: async () => [metroShirt, linenShirt, checkShirt],
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'stripp shirt' } })
        await runTool({ name: 'show_product', args: { productId: 18 } })
        return 'Striped shirt ithu nokku sir.'
      }) as Completer,
    })
    assert.match(result?.reply.primaryMatch?.product.name ?? '', /METRONAUT|Striped/i)
    assert.doesNotMatch(result?.reply.followUpText ?? '', /Linen Shirt/)
  })

  await test('whole store share is home URL and departments, not one SKU', async () => {
    assert.equal(wantsWholeStoreShare('Share your store have all product details'), true)
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Share your store have all product details',
      recentMessages: [],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt', 'Pants', 'T Shirt'],
      deps: { searchCatalog: async () => [linenShirt] },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'shirt' } })
        await runTool({ name: 'show_product', args: { productId: 8 } })
        return 'Ithaanu Linen Shirt. Ee linkil koodi nokkam :'
      }) as Completer,
    })
    assert.equal(result?.reply.primaryMatch, null)
    assert.match(result?.reply.primaryText ?? '', /shrox\.aishopy\.io/)
    assert.match(result?.reply.primaryText ?? '', /Shirt/)
    assert.doesNotMatch(result?.reply.primaryText ?? '', /Linen Shirt/)
  })

  await test('ithinte vere colours unda is Manglish', () => {
    assert.equal(detectLanguageAndScript('ithinte vere colours unda').language, 'Malayalam')
    assert.equal(detectLanguageAndScript('Stripp model shirts unda').language, 'Malayalam')
  })

  await test('other RAM of this listing uses owner option keys', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'vere RAM undo',
      recentMessages: [
        {
          role: 'store',
          text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/shop-phone-x-40`,
        },
      ],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Phones'],
      deps: { searchCatalog: async () => [phoneX] },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'phone' } })
        await runTool({ name: 'show_product', args: { productId: 40 } })
        return '8GB mathram und sir.'
      }) as Completer,
    })
    assert.equal(result?.reply.primaryMatch?.product.name, 'Shop Phone X')
    assert.match(result?.reply.primaryText ?? '', /8GB/)
    assert.match(result?.reply.primaryText ?? '', /12GB/)
  })

  await test('share all models in a department sends extras', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Shirtil olla model ella share cheyy with details',
      recentMessages: [
        {
          role: 'store',
          text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/check-shirt-9`,
        },
      ],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt', 'T Shirt'],
      deps: {
        searchCatalog: async () => [checkShirt, linenShirt, metroShirt],
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'shirt' } })
        await runTool({ name: 'show_product', args: { productId: 18 } })
        return 'Shirt models ithu nokku sir.'
      }) as Completer,
    })
    assert.ok(result?.reply.primaryMatch)
    assert.match(result?.reply.followUpText ?? '', /Check Shirt|Linen Shirt|ithupole|We also have/i)
  })

  await test('two named departments show extras from both types', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Yes shirt and t shirt model',
      recentMessages: [],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt', 'T Shirt', 'Pants'],
      deps: {
        searchCatalog: async (_storeId, _slug, _currency, filters) => {
          const category = typeof filters === 'string' ? '' : filters.categoryName
          if (category === 'T Shirt') return [tshirt]
          return [linenShirt, checkShirt]
        },
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'shirt' } })
        await runTool({ name: 'show_product', args: { productId: 8 } })
        return 'Shirt kazhinju T-Shirt kanam.'
      }) as Completer,
    })
    assert.equal(result?.reply.primaryMatch?.product.name, 'Linen Shirt')
    assert.match(result?.reply.followUpText ?? '', /T Shirt|Printed/i)
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
    assert.match(prompt, /last photo\/card is the product/)
    assert.match(prompt, /optionValues/)
    assert.match(prompt, /one photo per variant/)
    assert.match(prompt, /No markdown, no \[here\]\(url\)/)
    assert.match(prompt, /closeNames/)
    assert.match(prompt, /website is wrong/)
    assert.match(prompt, /already placed/)
    assert.match(prompt, /vere models/)
  })

  await test('honesty reject still keeps the shown product', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Pants vehnam',
      recentMessages: [],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Pants', 'Shirt'],
      deps: {
        searchCatalog: async () => [trousers, linenShirt],
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'pants' } })
        await runTool({ name: 'show_product', args: { productId: 19 } })
        return 'Yes sir, we have it. How can I assist you today?'
      }) as Completer,
    })
    assert.match(result?.reply.primaryMatch?.product.name ?? '', /Trousers/i)
    assert.match(result?.reply.primaryText ?? '', /ithu nokku/)
  })

  await test('discount stay on last product and does not show a new card', async () => {
    const tshirt = catalogMatch(4, 'Printed T Shirt', 299)
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: '3 piece eduthal price korayuvo',
      recentMessages: [
        {
          role: 'store',
          text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/men-loose-fit-brown-lycra-blend-trousers-19`,
        },
      ],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Pants', 'Shirt', 'T Shirt'],
      deps: {
        searchCatalog: async (_storeId, _slug, _currency, filters) => {
          const query = typeof filters === 'string' ? filters : filters.query
          if (/t shirt|piece/i.test(query)) return [tshirt]
          return [trousers]
        },
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'piece price' } })
        await runTool({ name: 'show_product', args: { productId: 4 } })
        return 'Yes sir, 3 piece discount und.'
      }) as Completer,
    })
    assert.match(result?.reply.primaryMatch?.product.name ?? '', /Trousers/i)
    assert.doesNotMatch(result?.reply.primaryMatch?.product.name ?? '', /T Shirt/)
  })

  await test('delivery before order does not look up orders', async () => {
    const called: string[] = []
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'book cheytha eppoyathekk deliver aavum',
      recentMessages: [
        {
          role: 'store',
          text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/check-shirt-9`,
        },
      ],
      customerPhone: '919999999999',
      conversationId: 11,
      shopSells: ['Shirt'],
      deps: {
        searchCatalog: async () => [checkShirt],
        collectOrders: async () => {
          called.push('collectOrders')
          return [checkOrder()]
        },
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        const orders = (await runTool({
          name: 'get_my_orders',
          args: { scope: 'latest' },
        })) as { orders: unknown[]; note?: string }
        assert.equal(orders.orders.length, 0)
        await runTool({ name: 'get_shop_info', args: { ask: 'delivery' } })
        return 'Yes sir, delivery shop policy anusarich aanu.'
      }) as Completer,
    })
    assert.equal(called.includes('collectOrders'), false)
    assert.equal(result?.intent.intent, 'product_search')
    assert.equal(result?.reply.primaryMatch?.product.name, 'Check Shirt')
  })

  await test('greeting includes the shop home URL', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Hi',
      recentMessages: [],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt'],
      completeWithTools: (async () => 'Hello! What can I help you with today at Shrox?') as Completer,
    })
    assert.match(result?.reply.primaryText ?? '', /shrox\.aishopy\.io/)
    assert.doesNotMatch(result?.reply.primaryText ?? '', /What can I help you/)
  })

  await test('last order phrases look up completed orders', async () => {
    let collected = false
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'ente last order enthayi',
      recentMessages: [
        {
          role: 'store',
          text: `Yes sir, ithu nokku.\nhttps://shrox.aishopy.io/product/check-shirt-9`,
        },
      ],
      customerPhone: '919999999999',
      conversationId: 11,
      shopSells: ['Shirt'],
      deps: {
        collectOrders: async () => {
          collected = true
          return [completedOrder()]
        },
      },
      completeWithTools: (async () =>
        'Ente khedam, ningalude oru orderum ippo recordil illa.') as Completer,
    })
    assert.equal(collected, true)
    assert.equal(result?.reply.primaryMatch, null)
    assert.match(result?.reply.primaryText ?? '', /NOV26-5/)
    assert.match(result?.reply.primaryText ?? '', /complete aayi|completed/i)
    assert.doesNotMatch(result?.reply.primaryText ?? '', /recordil illa|4 business|not shipped/i)
    assert.doesNotMatch(result?.reply.primaryText ?? '', /delivered on/i)
  })

  await test('status please uses order API not shop days', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Status please',
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
        collectOrders: async () => [completedOrder()],
      },
      completeWithTools: (async () =>
        'Your order hasn\'t been shipped yet. The usual delivery time is around 4 business days after shipping.') as Completer,
    })
    assert.match(result?.reply.primaryText ?? '', /NOV26-5/)
    assert.match(result?.reply.primaryText ?? '', /complete aayi|completed/i)
    assert.doesNotMatch(result?.reply.primaryText ?? '', /4 business|hasn't been shipped/i)
  })

  await test('order cheyyam eathra days is checkout plus shop days', async () => {
    let collected = false
    const result = await runInboxAgent({
      store: { ...store, shop_policies: { default_delivery_business_days: 4 } } as typeof store,
      channel: 'whatsapp',
      customerText: 'order cheyam... eathra days avum kittan',
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
        collectOrders: async () => {
          collected = true
          return [completedOrder()]
        },
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'trousers' } })
        await runTool({ name: 'show_product', args: { productId: 19 } })
        return 'Sir, order cheyyan ee link open cheyyuka. Quantity confirm cheythu payment cheyyuka.'
      }) as Completer,
    })
    assert.equal(collected, false)
    assert.equal(result?.reply.primaryMatch?.product.name, trousers.product.name)
    assert.match(result?.reply.primaryText ?? '', /4/)
    assert.match(result?.reply.primaryText ?? '', /business days/i)
  })

  await test('vere models shows a different SKU as primary', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'vere models indo',
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
        searchCatalog: async () => [checkShirt, linenShirt, metroShirt],
      },
      completeWithTools: (async (_system, _history, _tools, runTool) => {
        await runTool({ name: 'search_products', args: { query: 'models' } })
        await runTool({ name: 'show_product', args: { productId: 9 } })
        return 'Vere optionsum und. Ithu nokku.'
      }) as Completer,
    })
    assert.notEqual(result?.reply.primaryMatch?.product.name, 'Check Shirt')
    assert.match(result?.reply.primaryMatch?.product.name ?? '', /Linen|METRONAUT/)
  })

  await test('thanks after an order does not send a product card', async () => {
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'Thank you',
      recentMessages: [
        {
          role: 'store',
          text: 'Order number: NOV26-5\nOrder status: Completed\nFulfillment: Fulfilled',
        },
      ],
      customerPhone: '919999999999',
      conversationId: 11,
      shopSells: ['Pants'],
      deps: { searchCatalog: async () => [trousers] },
      completeWithTools: (async () =>
        'Thank you! If you need anything else from Shrox, feel free to let me know') as Completer,
    })
    assert.equal(result?.reply.primaryMatch, null)
    assert.doesNotMatch(result?.reply.primaryText ?? '', /Trousers|feel free/i)
  })

  await test('Manasilayilla and please malayalam stay Manglish', async () => {
    assert.equal(detectLanguageAndScript('Manasilayilla').language, 'Malayalam')
    const result = await runInboxAgent({
      store,
      channel: 'whatsapp',
      customerText: 'What.? Please malayalam',
      recentMessages: [{ role: 'customer', text: 'Manasilayilla' }],
      customerPhone: null,
      conversationId: 11,
      shopSells: ['Shirt'],
      completeWithTools: (async () =>
        'Could you please let me know what you need from Shrox?') as Completer,
    })
    assert.doesNotMatch(result?.reply.primaryText ?? '', /Could you please let me know/)
    assert.match(result?.reply.primaryText ?? '', /vendath|sheri|എന്താണ്/i)
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
