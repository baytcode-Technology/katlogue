import { completeWithFallback } from '../../../shared/llm/index.js'
import {
  buildShopOwnerSystemPrompt,
  type ShopOwnerTemplateTask,
} from '../prompts/shop-owner-persona.js'

export type LocalizedReplyTemplate = ShopOwnerTemplateTask

export type LocalizedReplyFacts = {
  storeName: string
  homeUrl: string
  requestedItem?: string | null
  availableProducts?: string[]
  refusalReason?: 'explicit' | 'code_request' | 'off_topic' | 'language_meta'
}

const FALLBACK_ENGLISH: Record<LocalizedReplyTemplate, (facts: LocalizedReplyFacts) => string> = {
  greeting: (f) =>
    `Hey! Welcome to ${f.storeName}.\n\nOur store: ${f.homeUrl}\n\nWhat are you looking for?`,
  not_found: (f) => {
    const item = f.requestedItem ? f.requestedItem : 'that'
    const list = f.availableProducts?.length
      ? `We have: ${f.availableProducts.join(', ')}.`
      : 'Check our store for all products.'
    return `Sorry, we don't have ${item} here. ${list}\n\nBrowse here: ${f.homeUrl}`
  },
  refusal: (f) => {
    if (f.refusalReason === 'explicit') {
      return `Sorry, can't help with that. What product do you need from ${f.storeName}?`
    }
    if (f.refusalReason === 'code_request') {
      return `I only help with shopping here. What product do you need from ${f.storeName}?`
    }
    if (f.refusalReason === 'language_meta') {
      return `What product are you looking for? Check our store: ${f.homeUrl}`
    }
    return `What can I help you find at ${f.storeName}? Browse here: ${f.homeUrl}`
  },
  product_intro: () => `Here it is:`,
  also_found_header: () => `We have more options too:`,
}

function buildFactsBlock(template: LocalizedReplyTemplate, facts: LocalizedReplyFacts): string {
  const lines = [`Store name: ${facts.storeName}`, `Store link: ${facts.homeUrl}`]
  if (facts.requestedItem) lines.push(`Item NOT available: ${facts.requestedItem}`)
  if (facts.availableProducts?.length) {
    lines.push(`Items we DO have: ${facts.availableProducts.join(', ')}`)
  }
  if (facts.refusalReason) lines.push(`Reason: ${facts.refusalReason}`)
  return lines.join('\n')
}

export async function buildLocalizedReply(input: {
  customerLanguage: string
  customerMessage?: string
  fallbackLanguage?: string | null
  customPrompt?: string | null
  conversationHistory?: string | null
  template: LocalizedReplyTemplate
  facts: LocalizedReplyFacts
}): Promise<string> {
  const lang =
    input.customerLanguage?.trim() && input.customerLanguage !== 'Unknown'
      ? input.customerLanguage.trim()
      : input.fallbackLanguage?.trim() || 'English'

  const factsBlock = buildFactsBlock(input.template, input.facts)

  const systemPrompt = buildShopOwnerSystemPrompt(
    {
      storeName: input.facts.storeName,
      homeUrl: input.facts.homeUrl,
      customerLanguage: lang,
      customerMessage: input.customerMessage,
      customPrompt: input.customPrompt,
      conversationHistory: input.conversationHistory,
    },
    input.template,
    factsBlock
  )

  try {
    const reply = await completeWithFallback(systemPrompt, [
      { role: 'user', content: `Write the reply in ${lang} only.` },
    ])
    const trimmed = reply.trim()
    if (trimmed && !trimmed.includes('could not reach our AI')) {
      return trimmed
    }
  } catch {
    // fall through
  }

  return FALLBACK_ENGLISH[input.template](input.facts)
}
