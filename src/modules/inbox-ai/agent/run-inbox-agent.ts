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
  formatConversationHistory,
  type InboxAiChannel,
} from '../services/conversation-history.service.js'
import type {
  ConversationHistoryLine,
  ParsedCustomerIntent,
} from '../services/parse-customer-intent.service.js'
import type { StaffHandoffAction } from '../services/staff-handoff.service.js'
import { isAgentReplyHonest } from './agent-guard.js'
import { buildInboxAgentSystemPrompt } from './inbox-agent-prompt.js'
import {
  createInboxAgentTools,
  INBOX_AGENT_TOOLS,
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

  const detected = detectLanguageAndScript(input.customerText)
  const homeUrl = getStoreHomeUrl(input.store)
  const history = formatConversationHistory(input.recentMessages)
  const userMessage = [
    history ? `Recent chat:\n${history}` : '',
    `Latest customer message:\n${input.customerText}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const tools = createInboxAgentTools({
    store: input.store,
    channel: input.channel,
    customerPhone: input.customerPhone,
    conversationId: input.conversationId,
    deps: input.deps,
  })

  const spoken = (
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
    console.info('[inbox-ai-agent] reply rejected by honesty guard')
    return null
  }

  const shown = tools.state.shown
  const caption = shown ? formatProductCaption(shown, input.store.currency) : ''
  const header =
    detected.language === 'Malayalam' && detected.scriptStyle === 'malayalam_script'
      ? 'ഇതുപോലെ വേറെയും ഉണ്ട്:'
      : detected.language === 'Malayalam'
        ? 'Ithupole vereyum ind:'
        : 'We also have:'
  const followUp = shown ? formatOtherMatches(tools.state.also.slice(0, 3), input.store.currency, header) : ''

  const reply: ProductReplyResult = {
    primaryText: [spoken, caption].filter(Boolean).join('\n\n'),
    followUpText: followUp || null,
    matches: shown ? [shown, ...tools.state.also] : [],
    primaryMatch: shown,
    imageUrl: shown ? getMatchImageUrl(shown) : null,
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
