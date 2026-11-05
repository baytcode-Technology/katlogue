import { detectLanguageAndScript } from '../../../shared/lib/detect-language-script.js'
import { getLlmProvider } from '../../../shared/llm/index.js'
import type { LlmProvider, LlmToolCall } from '../../../shared/llm/types.js'
import type { Store } from '../../stores/types/store.types.js'
import type { LastShownProduct } from '../services/build-localized-reply.service.js'
import type { ProductReplyResult } from '../services/build-product-reply.service.js'
import {
  formatOtherMatches,
  formatProductCaption,
  getMatchImageUrl,
  getStoreHomeUrl,
} from '../services/catalog-search.service.js'
import {
  extractLastShownProduct,
  formatConversationHistory,
  type InboxAiChannel,
} from '../services/conversation-history.service.js'
import type {
  ConversationHistoryLine,
  ParsedCustomerIntent,
} from '../services/parse-customer-intent.service.js'
import type { StaffHandoffAction } from '../services/staff-handoff.service.js'
import { isAgentReplyHonest, isHelpdeskEnglish, sanitizeAgentSpoken } from './agent-guard.js'
import { buildInboxAgentSystemPrompt } from './inbox-agent-prompt.js'
import {
  askedOptionKey,
  createInboxAgentTools,
  deniesOtherOptions,
  extraHitsIdentity,
  extraOptionVariants,
  INBOX_AGENT_TOOLS,
  matchAllShopDepartments,
  optionBoardLine,
  optionPhotoKey,
  queryIdentityTokens,
  stayOnLastProduct,
  wantsAlsoList,
  wantsOptionPhotos,
  wantsOtherModels,
  wantsWholeStoreShare,
  type InboxAgentToolDeps,
} from './inbox-agent-tools.js'

export type InboxAgentResult = {
  intent: ParsedCustomerIntent
  lastShownProduct: LastShownProduct | null
  reply: ProductReplyResult
  staffHandoff: StaffHandoffAction
}

function emptyIntent(
  language: string,
  scriptStyle: ParsedCustomerIntent['scriptStyle'],
  kind: ParsedCustomerIntent['intent']
): ParsedCustomerIntent {
  return {
    intent: kind,
    customerLanguage: language,
    scriptStyle,
    requestedItem: null,
    searchQuery: '',
    color: null,
    size: null,
    sku: null,
    categoryName: null,
    wantsImage: false,
    orderNumber: null,
    orderNumberHint: null,
    orderProductHint: null,
    orderScope: null,
    orderAsk: null,
    typedPhone: null,
    sessionTopic: null,
    missingWhy: null,
    alternativeCategories: [],
    rejectsLastShown: false,
    replyToLastQuestion: null,
  }
}

export function inboxAgentEnabled(): boolean {
  const provider = (process.env.LLM_PROVIDER ?? '').toLowerCase()
  return process.env.INBOX_AI_AGENT === '1' && (provider === 'gemini' || provider === 'openai')
}

function detectCustomerLanguage(
  text: string,
  recent: ConversationHistoryLine[]
): ReturnType<typeof detectLanguageAndScript> {
  const latest = detectLanguageAndScript(text)
  if (latest.language !== 'English') return latest
  const clearlyEnglish =
    /\b(please|would you|thank you|could you)\b/i.test(text) &&
    text.trim().split(/\s+/).filter(Boolean).length > 4
  if (clearlyEnglish) return latest
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i].role !== 'customer') continue
    const prior = detectLanguageAndScript(recent[i].text)
    if (prior.language !== 'English') return prior
  }
  return latest
}

export async function runInboxAgent(input: {
  store: Store
  channel: InboxAiChannel
  customerText: string
  recentMessages: ConversationHistoryLine[]
  customerPhone: string | null
  conversationId: number | null
  shopSells: string[]
  deps?: InboxAgentToolDeps
  completeWithTools?: LlmProvider['completeWithTools']
}): Promise<InboxAgentResult | null> {
  const provider = input.completeWithTools ? null : getLlmProvider()
  const completeWithTools =
    input.completeWithTools ?? provider?.completeWithTools?.bind(provider)
  if (!completeWithTools) return null

  const detected = detectCustomerLanguage(input.customerText, input.recentMessages)
  const homeUrl = getStoreHomeUrl(input.store)
  const history = formatConversationHistory(input.recentMessages)
  const lastShown = extractLastShownProduct(input.recentMessages)
  const languageLine =
    detected.language === 'Malayalam' && detected.scriptStyle === 'malayalam_script'
      ? 'Reply in Malayalam script only.'
      : detected.language === 'Malayalam'
        ? 'Reply in Manglish only (Malayalam in English letters). Not English helpdesk.'
        : 'Reply in English.'
  const userMessage = [
    history ? `Recent chat:\n${history}` : '',
    lastShown
      ? `Last product card we sent: ${lastShown.title}. That photo is the product until they name a new type. Size/colour = this listing's options from the tool result. "This one", discount, quantity, and book stay on it. Do not list other products unless they asked for more.`
      : '',
    languageLine,
    `Latest customer message:\n${input.customerText}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const tools = createInboxAgentTools({
    store: input.store,
    channel: input.channel,
    customerPhone: input.customerPhone,
    conversationId: input.conversationId,
    shopSells: input.shopSells,
    lastShownTitle: lastShown?.title ?? null,
    customerText: input.customerText,
    deps: input.deps,
  })

  const rawSpoken = (
    await completeWithTools(
      buildInboxAgentSystemPrompt({
        storeName: input.store.name,
        homeUrl,
        departments: input.shopSells,
        customerLanguage: detected.language,
        scriptStyle: detected.scriptStyle,
        storeDescription: input.store.description,
        ownerNotes: input.store.ai_system_prompt,
      }),
      [{ role: 'user', content: userMessage }],
      INBOX_AGENT_TOOLS,
      async (call: LlmToolCall) => {
        console.info('[inbox-ai-agent] tool %s %s', call.name, JSON.stringify(call.args))
        return tools.runTool(call.name, call.args)
      }
    )
  ).trim()

  tools.showBestSearchMatch()

  const stay = stayOnLastProduct(input.customerText, lastShown?.title ?? null, input.shopSells)
  const storeShare = wantsWholeStoreShare(input.customerText)
  const optionPhotos = wantsOptionPhotos(input.customerText)
  if (storeShare) {
    tools.state.shown = null
    tools.state.also = []
  } else if (!tools.state.shown && stay && lastShown) {
    await tools.runTool('search_products', { query: lastShown.title })
    tools.showBestSearchMatch()
  }

  const cannedProduct =
    detected.language === 'Malayalam' && detected.scriptStyle === 'malayalam_script'
      ? 'ഇത് നോക്കൂ സാർ.'
      : detected.language === 'Malayalam'
        ? 'Yes sir, ithu nokku.'
        : 'Yes sir, here it is.'
  const cannedGreeting =
    detected.language === 'Malayalam' && detected.scriptStyle === 'malayalam_script'
      ? `സ്വാഗതം സാർ. Catalog ഇവിടെ: ${homeUrl}`
      : detected.language === 'Malayalam'
        ? `Hi sir, swagatham. Catalog ithu: ${homeUrl}`
        : `Hi, welcome. Browse our catalog.\n${homeUrl}`
  const looksLikeGreeting = /^(hi|hello|hey|hai|namaste)\b/i.test(input.customerText.trim())

  let spoken = sanitizeAgentSpoken(rawSpoken, { stripUrls: Boolean(tools.state.shown) })

  if (!spoken && tools.state.shown) spoken = cannedProduct
  const shownName = tools.state.shown?.product.name.toLowerCase() ?? ''
  if (
    stay &&
    tools.state.shown &&
    tools.state.found.some((row) => {
      const name = row.product.name.toLowerCase()
      return name !== shownName && spoken.toLowerCase().includes(name)
    })
  ) {
    spoken = cannedProduct
  }
  const board = tools.state.shown?.variantBoard
  const optionKey = askedOptionKey(input.customerText, board)
  const optionValues = optionKey ? board?.optionValues[optionKey] ?? [] : []
  if (stay && optionKey && optionValues.length > 1 && deniesOtherOptions(spoken)) {
    spoken = optionBoardLine(optionKey, optionValues, detected.language, detected.scriptStyle)
  }
  if (looksLikeGreeting && !tools.state.shown) {
    if (!spoken || isHelpdeskEnglish(spoken) || !spoken.includes(homeUrl)) {
      spoken = cannedGreeting
    }
  }
  const deptLine = input.shopSells.length > 0 ? input.shopSells.join(', ') : ''
  const cannedStore =
    detected.language === 'Malayalam' && detected.scriptStyle === 'malayalam_script'
      ? `Catalog: ${homeUrl}${deptLine ? `\n${deptLine}` : ''}`
      : detected.language === 'Malayalam'
        ? `Catalog ithu: ${homeUrl}.${deptLine ? ` Shopil: ${deptLine}.` : ''}`
        : `Browse our catalog: ${homeUrl}${deptLine ? `\nWe sell: ${deptLine}.` : ''}`
  if (storeShare) {
    spoken = cannedStore
  }
  if (
    optionPhotos &&
    tools.state.shown &&
    /sell cheyyunnilla|cannot send|only one photo|system (can )?only|we don.?t sell/i.test(spoken)
  ) {
    spoken = cannedProduct
  }

  const allowed = [userMessage, homeUrl, ...tools.state.facts].join('\n')
  if (
    !isAgentReplyHonest({
      reply: spoken,
      allowed,
      language: detected.language,
      scriptStyle: detected.scriptStyle,
      showedProduct: Boolean(tools.state.shown),
      lookedUpOrders: tools.state.lookedUpOrders,
    })
  ) {
    console.info('[inbox-ai-agent] reply rejected by honesty guard; keeping tools')
    if (tools.state.shown) {
      spoken = cannedProduct
    } else if (storeShare || looksLikeGreeting) {
      spoken = storeShare ? cannedStore : cannedGreeting
    } else {
      return null
    }
  }

  const shown = tools.state.shown
  const caption = shown ? formatProductCaption(shown, input.store.currency) : ''
  const header =
    detected.language === 'Malayalam' && detected.scriptStyle === 'malayalam_script'
      ? 'ഇതുപോലെ വേറെയും ഉണ്ട്:'
      : detected.language === 'Malayalam'
        ? 'Ithupole vereyum ind:'
        : 'We also have:'
  const extras = wantsAlsoList(input.customerText, lastShown?.title ?? null, input.shopSells)
  const identity = queryIdentityTokens(input.customerText, input.shopSells)
  const departmentBrowse =
    wantsOtherModels(input.customerText) ||
    matchAllShopDepartments(input.customerText, input.shopSells).length >= 2
  let also = extras ? tools.state.also.slice(0, 3) : []
  if (extras && identity.length > 0 && !departmentBrowse) {
    also = also.filter((row) => extraHitsIdentity(row.product.name, identity)).slice(0, 3)
  }
  const followUp = shown && also.length > 0 ? formatOtherMatches(also, input.store.currency, header) : ''

  const extraCards =
    optionPhotos && shown
      ? extraOptionVariants(
          shown,
          optionPhotoKey(input.customerText, shown.variantBoard) ?? '',
          input.store.slug
        )
          .map((row) => {
            const imageUrl = getMatchImageUrl(row)
            if (!imageUrl) return null
            const valueKey = optionPhotoKey(input.customerText, shown.variantBoard)
            const label = valueKey
              ? String(row.variant?.options?.[valueKey] ?? row.variant?.name ?? '')
              : row.variant?.name ?? ''
            return {
              imageUrl,
              caption: [label, formatProductCaption(row, input.store.currency)].filter(Boolean).join('\n\n'),
            }
          })
          .filter((card): card is { imageUrl: string; caption: string } => card != null)
      : []

  const igExtras =
    extraCards.length > 0
      ? extraCards.map((card) => card.caption).join('\n\n')
      : ''

  const reply: ProductReplyResult = {
    primaryText: [spoken, caption].filter(Boolean).join('\n\n'),
    followUpText: [followUp, input.channel === 'instagram' ? igExtras : ''].filter(Boolean).join('\n\n') || null,
    matches: shown ? [shown, ...also] : [],
    primaryMatch: shown,
    imageUrl: shown ? getMatchImageUrl(shown) : null,
    extraCards,
  }

  const kind: ParsedCustomerIntent['intent'] = tools.state.helpline
    ? 'order_status'
    : shown
      ? 'product_search'
      : tools.state.lookedUpOrders
        ? 'order_status'
        : 'greeting'

  return {
    intent: {
      ...emptyIntent(detected.language, detected.scriptStyle, kind),
      orderAsk: tools.state.helpline ? 'cancel' : tools.state.lookedUpOrders ? 'full' : null,
      sessionTopic: tools.state.lookedUpOrders ? 'order' : shown ? 'product' : null,
    },
    lastShownProduct: shown ? { title: shown.product.name, url: shown.url } : null,
    reply,
    staffHandoff: tools.state.helpline ? 'warn' : 'none',
  }
}
