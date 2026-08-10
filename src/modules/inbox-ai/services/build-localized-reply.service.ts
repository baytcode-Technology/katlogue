import { completeWithFallback } from '../../../shared/llm/index.js'

export type LocalizedReplyTemplate =
  | 'greeting'
  | 'not_found'
  | 'refusal'
  | 'product_intro'
  | 'also_found_header'

export type LocalizedReplyFacts = {
  storeName: string
  homeUrl: string
  requestedItem?: string | null
  availableProducts?: string[]
  refusalReason?: 'explicit' | 'code_request' | 'off_topic'
}

const TEMPLATE_INSTRUCTIONS: Record<LocalizedReplyTemplate, string> = {
  greeting:
    'Welcome them briefly. Share the store link. Ask what product they need (name, color, size). Be direct — no long stories.',
  not_found:
    'Say clearly we do NOT have the requested item. List the products we DO have. Share the store link. Be direct and helpful — do NOT comment on their personal situation (wedding, party, etc.).',
  refusal:
    'Politely refuse and redirect to ask about products at this store only. Be brief.',
  product_intro:
    'One very short line before product details (e.g. "Here it is:"). Do NOT repeat product name, price, or link.',
  also_found_header:
    'One very short line before a list of more options. Do NOT list products.',
}

const FALLBACK_ENGLISH: Record<LocalizedReplyTemplate, (facts: LocalizedReplyFacts) => string> = {
  greeting: (f) =>
    `Hey! Welcome to ${f.storeName}.\n\nOur store: ${f.homeUrl}\n\nWhat product are you looking for?`,
  not_found: (f) => {
    const item = f.requestedItem ? f.requestedItem : 'that'
    const list = f.availableProducts?.length
      ? `We have: ${f.availableProducts.join(', ')}.`
      : 'Check our store for all products.'
    return `Sorry, we don't have ${item}. ${list}\n\nBrowse here: ${f.homeUrl}`
  },
  refusal: (f) => {
    if (f.refusalReason === 'explicit') {
      return `Sorry, I can't help with that. Ask me about products at ${f.storeName}.`
    }
    if (f.refusalReason === 'code_request') {
      return `I can only help with shopping. What product do you need from ${f.storeName}?`
    }
    return `I help with shopping at ${f.storeName}. Ask about a product or visit: ${f.homeUrl}`
  },
  product_intro: () => `Here it is:`,
  also_found_header: () => `More options:`,
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
  template: LocalizedReplyTemplate
  facts: LocalizedReplyFacts
}): Promise<string> {
  const lang =
    input.customerLanguage?.trim() && input.customerLanguage !== 'Unknown'
      ? input.customerLanguage.trim()
      : input.fallbackLanguage?.trim() || 'English'

  const task = TEMPLATE_INSTRUCTIONS[input.template]
  const factsBlock = buildFactsBlock(input.template, input.facts)
  const messageContext = input.customerMessage?.trim()
    ? `\nCustomer's original message (write your reply in the SAME language as this message):\n"${input.customerMessage.trim()}"\n`
    : ''

  const systemPrompt = `You are a casual shop assistant on WhatsApp for "${input.facts.storeName}".

LANGUAGE RULE (most important):
- The customer wrote in ${lang}.
- You MUST reply ONLY in ${lang}.
- Do NOT reply in English if they wrote in Mongolian, Malayalam, Punjabi, Hindi, Tamil, or any other language.
- Do NOT reply in Malayalam if they wrote in Mongolian. Match their language exactly.
${messageContext}
STYLE:
- Short, direct, friendly — like texting back from a shop.
- Only talk about this store's products. No outside topics.
- Do NOT comment on personal stories (wedding, party, birthday, tomorrow, etc.) — only answer about products.
- Do NOT invent product names, prices, or URLs — use ONLY the facts below.
- Under 400 characters. No markdown.

Task: ${task}

Facts (use exactly):
${factsBlock}`

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
