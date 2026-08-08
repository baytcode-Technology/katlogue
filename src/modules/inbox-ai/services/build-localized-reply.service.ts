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

const TEMPLATE_FACTS: Record<LocalizedReplyTemplate, string> = {
  greeting: `Welcome the customer to the store casually. Share the store link. Ask what product they are looking for (name, color, size, or SKU).`,
  not_found: `Tell them we don't have the requested item. List what we DO have in the store. Share the store link so they can browse all products.`,
  refusal: `Politely refuse and redirect them to ask about products at this store only.`,
  product_intro: `One short casual line introducing the product you found. Do NOT repeat product name, price, or link — those come in the next message.`,
  also_found_header: `One short casual line saying you found more options. Do NOT list products — the list comes next.`,
}

const FALLBACK_ENGLISH: Record<LocalizedReplyTemplate, (facts: LocalizedReplyFacts) => string> = {
  greeting: (f) =>
    `Hey! Welcome to ${f.storeName} 👋\n\nCheck out our store: ${f.homeUrl}\n\nWhat are you looking for? Tell me a product, color, size, or SKU.`,
  not_found: (f) => {
    const item = f.requestedItem ? `"${f.requestedItem}"` : 'that'
    const list = f.availableProducts?.length
      ? `We have: ${f.availableProducts.join(', ')}.`
      : 'Browse our catalog to see everything we sell.'
    return `Sorry, we don't have ${item} right now. ${list}\n\nSee all products here: ${f.homeUrl}`
  },
  refusal: (f) => {
    if (f.refusalReason === 'explicit') {
      return `Sorry, I can't help with that. I'm here to help you shop at ${f.storeName} — ask me about our products!`
    }
    if (f.refusalReason === 'code_request') {
      return `I can't share technical stuff. Tell me what product you're looking for at ${f.storeName}!`
    }
    return `I'm here to help you shop at ${f.storeName}. Ask me about our products or check: ${f.homeUrl}`
  },
  product_intro: () => `Here's what I found for you:`,
  also_found_header: () => `I also found these:`,
}

function buildFactsBlock(template: LocalizedReplyTemplate, facts: LocalizedReplyFacts): string {
  const lines = [
    `Store name: ${facts.storeName}`,
    `Store link: ${facts.homeUrl}`,
  ]
  if (facts.requestedItem) lines.push(`Requested item (not available): ${facts.requestedItem}`)
  if (facts.availableProducts?.length) {
    lines.push(`Products we DO have: ${facts.availableProducts.join(', ')}`)
  }
  if (facts.refusalReason) lines.push(`Refusal reason: ${facts.refusalReason}`)
  return lines.join('\n')
}

export async function buildLocalizedReply(input: {
  customerLanguage: string
  fallbackLanguage?: string | null
  template: LocalizedReplyTemplate
  facts: LocalizedReplyFacts
}): Promise<string> {
  const lang =
    input.customerLanguage?.trim() && input.customerLanguage !== 'Unknown'
      ? input.customerLanguage
      : input.fallbackLanguage?.trim() || 'English'

  const task = TEMPLATE_FACTS[input.template]
  const factsBlock = buildFactsBlock(input.template, input.facts)

  const systemPrompt = `You are a casual shop assistant on WhatsApp for "${input.facts.storeName}".
Reply ONLY in ${lang}. Sound friendly and natural — like a real shop person, not a robot.
Only talk about this store and its products. Do not discuss the outside world, news, politics, or technical topics.
Do NOT invent product names, prices, or URLs — use ONLY the facts below.
Keep under 400 characters. No markdown.

Task: ${task}

Facts (use exactly):
${factsBlock}`

  try {
    const reply = await completeWithFallback(systemPrompt, [
      { role: 'user', content: 'Write the reply now.' },
    ])
    const trimmed = reply.trim()
    if (trimmed && !trimmed.includes('could not reach our AI')) {
      return trimmed
    }
  } catch {
    // fall through to English template
  }

  return FALLBACK_ENGLISH[input.template](input.facts)
}
