import {
  detectLanguageAndScript,
  type ScriptStyle,
} from '../../../shared/lib/detect-language-script.js'
import { completeJson } from '../../../shared/llm/index.js'
import { extractOpenOffer } from './conversation-history.service.js'

export type { ScriptStyle }
export { detectLanguageAndScript }

export type CustomerIntent =
  | 'greeting'
  | 'acknowledgement'
  | 'buy_intent'
  | 'product_search'
  | 'sku_lookup'
  | 'category_search'
  | 'image_request'
  | 'order_status'
  | 'language_switch'
  | 'refuse'
  | 'shop_info'
  | 'off_topic'
  | 'explicit'

export type OrderScope = 'latest' | 'all' | 'specific' | 'product'

/** What they asked about an existing order. `full` is the only time we paste the block. */
export type OrderAsk =
  | 'full'
  | 'confirm_last'
  | 'eta'
  | 'why'
  | 'delay'
  | 'urgency'
  | 'payment'
  | 'items'
  | 'cancel'
  | 'address'
  | 'not_mine'
  | 'refund'

/** Why a catalog miss: this shop does not sell it vs sold out. */
export type MissingWhy = 'not_sold' | 'sold_out'

export type SessionTopic = 'order' | 'product' | 'missing' | null

export type LastQuestionAnswer = 'yes' | 'no' | null

/** Intents that carry no product to look up in the catalog. */
const NON_CATALOG_INTENTS: ReadonlySet<CustomerIntent> = new Set<CustomerIntent>([
  'acknowledgement',
  'buy_intent',
  'order_status',
  'refuse',
  'language_switch',
  'shop_info',
])

export type ParsedCustomerIntent = {
  intent: CustomerIntent
  customerLanguage: string
  scriptStyle: ScriptStyle
  requestedItem: string | null
  searchQuery: string
  color: string | null
  size: string | null
  sku: string | null
  categoryName: string | null
  wantsImage: boolean
  orderNumber: string | null
  orderNumberHint: string | null
  orderProductHint: string | null
  orderScope: OrderScope | null
  orderAsk: OrderAsk | null
  typedPhone: string | null
  sessionTopic: SessionTopic
  missingWhy: MissingWhy | null
  /** Later products they also accepted, in the order they named them. */
  alternativeCategories: string[]
  /** They rejected the last sent product and named a different item. */
  rejectsLastShown: boolean
  /** Their answer to the question we asked about the product we just offered. */
  replyToLastQuestion: LastQuestionAnswer
  /** Set when message is off-topic due to language-capability questions */
  offTopicReason?: 'language_meta' | 'general' | null
}

export type ConversationHistoryLine = {
  role: 'customer' | 'store'
  text: string
  /** When the message was sent. Used to ignore chat from a previous visit. */
  at?: string | null
}

export type ParseCustomerIntentOptions = {
  recentMessages?: ConversationHistoryLine[]
  /** This shop's own department names — clothing, mixers, grocery, etc. */
  storeCategories?: string[]
}

export type LlmIntentResult = {
  intent?: CustomerIntent
  customerLanguage?: string
  requestedItem?: string | null
  searchQuery?: string
  color?: string | null
  size?: string | null
  sku?: string | null
  categoryName?: string | null
  wantsImage?: boolean
  orderNumber?: string | null
  orderNumberHint?: string | null
  orderProductHint?: string | null
  orderScope?: OrderScope
  orderAsk?: OrderAsk | null
  typedPhone?: string | null
  replyToLastQuestion?: LastQuestionAnswer | string
}

const INTENT_SCHEMA = `You classify customer messages for a store WhatsApp/Instagram inbox.

CRITICAL — Language:
- Detect the EXACT language the customer wrote in.
- Malayalam script or words → customerLanguage: "Malayalam" (NOT Tamil)
- Tamil script or words → customerLanguage: "Tamil"
- Mixed English + Malayalam → customerLanguage: "Malayalam" (or note mixed — still reply in their mix)
- NEVER assign Tamil if they wrote Malayalam. NEVER assign a different language than what the customer used.
- Manglish (Malayalam typed with English letters) is still Malayalam → customerLanguage: "Malayalam".
  Manglish markers: undo, undu, ond, illa, ille, aanu, aahn, vendam, vehnam, ethra, vila, kittumo, ayakkavo, cheyyam, edukkam, koodi, ulla, entha.
  "blue shirt undo?" → customerLanguage: "Malayalam" (NOT English).

CRITICAL — Extract product only:
- Occasion words (wedding, marriage, party, tomorrow, gift, birthday) are tone only. Never put them in searchQuery.
- If they name more than one product ("kurta or shirt"), searchQuery is the FIRST product. Do not drop the others; code reads them from the message.
- A greeting by itself ("hi", "hello") is greeting with searchQuery "". "Hi, I need a blue shirt" is product_search.
- "വെള്ള shirt ഉണ്ടോ?" → product_search, searchQuery: "shirt", color: "white", customerLanguage: "Malayalam"
- "blue shirt undo?" → product_search, searchQuery: "shirt", color: "blue", requestedItem: "blue shirt"
- Keep style, fabric, fit, brand, and model words in searchQuery. "check shirt" / "linen shirt" / "mixie" stay those words — never shrink to a bare department like "shirt". Color and size stay in their own fields.
- Pairing / owned-item context: "I have a green shirt, need pants to pair / send pant images" → searchQuery: "pants", categoryName: "pants", color: null. Do NOT search for the item they already own.
- "ente kayyil oru green shirt ond … pantsinte images ayackavo" → searchQuery: "pants", categoryName: "pants", color: null.
- Latest message product type ALWAYS overrides prior conversation. If they talked about shirts and now ask for pants, searchQuery is "pants" — never keep "shirt".
- If they reject the last item ("ith shirt alle, t shirt vendath", "not this, I want a mixer"), searchQuery/categoryName are what they want NOW. categoryName should be this shop's department name when it matches.
- Follow-ups: if they previously asked about shirts and now say ONLY "white?" or "വെള്ള?" with no new product type → product_search, color: "white", searchQuery: "shirt"
- Only extract what product they want to buy.

Normalize product search terms to English for database lookup.

Return JSON only:
{
  "intent": "greeting" | "acknowledgement" | "buy_intent" | "product_search" | "sku_lookup" | "category_search" | "image_request" | "order_status" | "language_switch" | "refuse" | "shop_info" | "off_topic" | "explicit",
  "orderAsk": "full" | "confirm_last" | "eta" | "why" | "delay" | "urgency" | "payment" | "items" | "cancel" | "address" | "not_mine" | "refund" | null,
  "customerLanguage": "exact language name e.g. English, Hindi, Malayalam, Tamil, Punjabi, Arabic",
  "requestedItem": "product they want in English e.g. white check shirt, or null",
  "searchQuery": "English product identity without color/size e.g. check shirt, linen shirt, mixie — not a bare department like shirt unless they named only that",
  "color": "English color e.g. white, black, or null",
  "size": "S, M, L, XL, or null",
  "sku": "SKU if mentioned or null",
  "categoryName": "this shop's department name if they named one (not always clothing), or null",
  "wantsImage": true if they ask for photo/image,
  "orderNumber": "full order number e.g. JAN26-3 if mentioned, or null",
  "orderNumberHint": "bare digits after order e.g. 88 from 'order 88', or null",
  "orderProductHint": "product identity in an order question e.g. check shirt, not a bare shirt unless they only said shirt, or null",
  "orderScope": "latest" | "all" | "specific" | "product" | null,
  "typedPhone": "a 10-15 digit phone the customer typed, or null",
  "replyToLastQuestion": "yes" | "no" | null
}

Our last question:
- When the input shows "Our last question to the customer", decide if the latest message answers it. Any language, slang, or emoji counts: agreeing or wanting it → "yes"; declining → "no".
- If the message asks something new, names a different product, or does not answer that question → null.
- When there is no last question shown, always null.
- Saying yes to "would you like to order?" does NOT place an order. Orders are placed only on the checkout link.

Rules:
- shop_info: shop location, hours, catalogue, what you sell, delivery charge/days (no existing order), payment methods, return/refund policy, offers. searchQuery: "". Not product_search. If they talk about an order they already placed (1 month wait, refund for that order, eppo deliver that product), use order_status, not shop_info.
- refuse: they do not want anything. "onnum venda", "illa enickonnum venda okay", "no thanks", "not interested", "vendam" with no new product. searchQuery: "". NEVER product_search or buy_intent.
- language_switch: they asked to continue in another language. "malayalathil paray", "in Hindi", "English il". Keep the last topic. Not off_topic.
- acknowledgement: the customer is only reacting, not asking for a new product. "ok", "okay", "k", "ok sir", "thanks", "thank you", "super", "nice", "good", "got it", "fine", "mm", "hmm", "ശരി", "sheri", "ok saar", "adipoli", or emoji only.
  For acknowledgement ALWAYS return searchQuery: "", color: null, categoryName: null, requestedItem: null — even if earlier messages were about shirts. Do NOT repeat the previous product.
  "ok" → intent: "acknowledgement", searchQuery: "". NEVER product_search.
  After we already sent an order status, "ok" is still acknowledgement — do not start a sale.
  But "ok blue shirt undo?" mentions a NEW product → product_search, searchQuery: "shirt", color: "blue".
  "aa check shirt aahn vendath" → product_search, searchQuery: "check shirt", not "shirt".
- buy_intent: the customer wants to buy or order what was already discussed, without naming a new product. "I'll take it", "ok I want this", "how to order", "order cheyyam", "order cheyyan pattumo", "book it", "edukkam", "എടുക്കാം", "വേണം" alone, "how to pay", "cash on delivery undo".
  For buy_intent ALSO return searchQuery: "", categoryName: null. Keep size/color if they stated one (e.g. "L edukkam" → size: "L").
- Any product availability, price, or shopping question = product_search (NOT off_topic), even with personal context.
- order_status for: my/last/recent order, all/total orders, order status, tracking, shipped, delivery, payment status, where is my order, "order evide", "kittiyilla", "ordered today" — NOT product_search or off_topic.
- "where is my shirt order" → order_status, orderScope: "product", orderProductHint: "shirt", searchQuery: "".
- "where is my check shirt order" → order_status, orderScope: "product", orderProductHint: "check shirt", searchQuery: "".
- "status of order JAN26-5" → order_status, orderScope: "specific", orderNumber: "JAN26-5".
- "order 88" / "order 10" → order_status, orderNumberHint: "88" or "10", orderScope: "specific".
- "my last order" / "last order status" / "ente last order" → order_status, orderScope: "latest".
- "all my orders" / "my orders" / "total orders" / "how many orders" / "ella orders" / "orders okke" / "ente orders ellam" → order_status, orderScope: "all".
- "where is my order" (no last/all) → order_status, orderScope: "latest".
- orderAsk is a HINT for the kind of ask, not the reply wording. "order details" → full (only if we have not already pasted the block). "is this my last order" → confirm_last. "time kittiyillenna why" → why. "1 month kayinj" → delay. "eppo deliver" → eta. "pettann vehnam" → urgency. COD / payment pending → payment. cancel / change address / not my order → cancel / address / not_mine. Repeat after a pasted block → not full.
- "cancel my order" → order_status, orderAsk: "cancel". Do not invent a cancel.
- "this is not my order" → order_status, orderAsk: "not_mine".
- Messages in any language about products = product_search (unless clearly about an existing order).
- off_topic for: "do you know Malayalam?", "can you speak Hindi?", reading PDFs/files, general knowledge, app/code questions, unrelated chat — NO shopping intent. Asking to reply in Malayalam is language_switch, not off_topic.
- explicit only for sexual/violent/harassing content.`

/** Greeting with no product ask. "Hi, I need a blue shirt" must not match. */
const GREETING_ONLY_PATTERN =
  /^(?:hi+|hello+|hey+|helo|good\s+(?:morning|afternoon|evening)|namaste|vanakkam|hola|assalam(?:u\s+alaikum)?|salam|നമസ്കാരം|ഹലോ|നമസ്കാര|नमस्ते|হ্যালো)(?:[\s,!.🙏😊😀🙂]+(?:sir|saar|sar|bro|സാർ|ചേട്ടാ))?[\s.!,🙏😊😀🙂]*$/iu

const OCCASION_PATTERN =
  /\b(marriage|wedding|party|tomorrow|birthday|gift|function|engagement|reception)\b|വിവാഹം|കല്യാണം/i

/**
 * Pure reactions with no new product ask. Anchored so "ok blue shirt undo?"
 * still reaches product_search.
 */
const ACK_PATTERN =
  /^(ok(?:ay|ey)?|okk+|k|kk|ack|ss|mm+|hm+|sheri|seri|thanks?|thank\s*you|thx|ty|tnx|nice|super|good|great|cool|fine|got\s*it|understood|adipoli|kollam|balle|ശരി|നന്ദി|കൊള്ളാം|അടിപൊളി|ठीक|शुक्रिया|சரி|நன்றி)[\s.!,👍🙏😊😀🙂❤️✅]*(ok|okay|sir|saar|sar|chetta|chechi|bro|madam|സാർ|ചേട്ടാ|ചേച്ചി)?[\s.!,👍🙏😊😀🙂❤️✅]*$/i

/** Emoji / punctuation only messages are reactions too. */
const EMOJI_ONLY_PATTERN =
  /^[\s.!,?👍🙏😊😀🙂😍🥰❤️💖✅🔥👌💯🤝😅😂🎉⭐️✨]+$/u

/** Wants to buy / order what was already shown, without naming a new product. */
const BUY_INTENT_PATTERN =
  /\b(how\s+(do\s+i|to|can\s+i)\s+(order|buy|pay)|i(?:'| a)?ll?\s+take\s+(it|this)|i\s+want\s+(it|this)|book\s+(it|this)|place\s+(the\s+)?order|order\s+cheyy?(am|aam|an|anam|umo|ano)|cheyyahnam|cheyyanam|cheyyam|order\s+cheyyan\s+pattum(o)?|edukk?(am|aam|ano|umo)|vaangan|vangam|cash\s+on\s+delivery|\bcod\b|online\s+payment|delivery\s+charge|free\s+delivery)\b|എടുക്കാം|ഓർഡർ\s*ചെയ്യ|വാങ്ങ/i

const LANGUAGE_META_PATTERN =
  /\b(do\s+you\s+know|can\s+you\s+speak|do\s+you\s+speak|know\s+malayalam|know\s+tamil|know\s+hindi|മലയാളം\s*അറിയാമോ|അറിയാമോ|നിങ്ങൾക്ക്\s*മലയാളം|നിനക്ക്\s*മലയാളം)\b/i

/** Ask to continue in another language — not “do you know Malayalam?” */
const LANGUAGE_SWITCH_PATTERN =
  /\b(malayalathil\s+paray|malayalathil|englishil|hindiil|tamilil|in\s+malayalam|in\s+hindi|in\s+english|hindi\s+il|english\s+il|tamil\s+il|speak\s+(?:in\s+)?(?:malayalam|hindi|english|tamil)|tell\s+me\s+in\s+\w+|reply\s+in\s+\w+|മലയാളത്തിൽ)\b/i

const REFUSE_PATTERN =
  /\b(onnum\s*venda|onnum\s*venam\s*illa|enickonnum\s*venda|enik(?:ku)?onnum\s*venda|no\s+thanks|not\s+interested|don'?t\s+want\s+(anything|it)|nothing\s+(needed|thanks)|illa\s+enickonnum\s*venda|vendam\s+okay|onnum\s+venda\s+okay)\b|ഒന്നും\s*വേണ്ട|^(?:no|nope|nah|not\s+now|venda|vendam|veanda|nahi|nahin|வேண்டாம்|വേണ്ട|नहीं)(?:\s+(?:sir|saar|thanks|bro))?[\s.!👎]*$/i

const BARE_PRICE_PATTERN =
  /^(?:price|vila|ethra|cost|how\s+much|rate)[\s?!.]*$/i

const SHOP_INFO_PATTERN =
  /\b(what\s+(do\s+you\s+sell|products?\s+do\s+you)|product\s+catalogue|catalog|special\s+offers?|discounts?\s+currently|where\s+is\s+(your\s+)?shop|physical\s+store|shop\s+(located|timings?|hours)|shop\s+(evide|varun)|ning(alude|ada)\s+shop|evidahn|online\s+orders?|deliver(y)?\s+(to|charge|fee|take|time)|free\s+delivery|same[\s-]?day|next[\s-]?day|payment\s+methods?|google\s+pay|gpay|upi|cash\s+on\s+delivery|\bcod\b|return\s+policy|replacement|exchange|refund\s+policy)\b/i

const SHOP_LOCATION_PATTERN =
  /\b(where\s+is\s+(your\s+)?shop|physical\s+store|shop\s+(located|evide|varun)|ning(alude|ada)\s+shop|evidahn)\b/i

const SHOP_HOURS_PATTERN = /\b(shop\s+(timings?|hours)|hours|open\s+time)\b/i
const SHOP_OFFER_PATTERN = /\b(special\s+offers?|discounts?\s+currently|any\s+offer)\b/i
const SHOP_RETURNS_PATTERN = /\b(return\s+policy|replacement|exchange|refund\s+policy)\b/i
const SHOP_DELIVERY_POLICY_PATTERN =
  /\b(deliver(y)?\s+(to|charge|fee|take|time)|free\s+delivery|same[\s-]?day|next[\s-]?day)\b/i
const SHOP_PAYMENT_PATTERN =
  /\b(payment\s+methods?|google\s+pay|gpay|upi|cash\s+on\s+delivery|\bcod\b)\b/i

const WHAT_WE_SELL_PATTERN =
  /\b(what\s+(do\s+you\s+sell|products?)|product\s+catalogue|catalog(ue)?)\b/i

const STOCK_WHY_PATTERN =
  /\b(stock\s*out|sold\s*out|shopil\s*illa|shopil\s*illayo|atho\s+shopil)\b/i

const ORDER_CONFIRM_LAST_PATTERN =
  /\b(is\s+this\s+(in\s+)?my\s+last\s+order|this\s+(is\s+)?my\s+last\s+order|ithu\s+(ente\s+)?last\s+order|last\s+order\s+(ano|alle)|confirm\s+(the\s+)?(last\s+)?order)\b/i

const ORDER_ETA_PATTERN =
  /\b(eppo\s+(?:\S+\s+){0,3}(deliver|kitt|var|aavum|ethum)|when.{0,40}(deliver|come|arrive)|delivery\s+(date|time)|epp[o]?zhe\s+kitt|kitte?\s*(um|um\?)|arrive|correct\s+date)\b/i

const ORDER_WHY_PATTERN =
  /\b(why|entha|enthina|enthinnu|kittiyillen+a\s+why|time\s+kittiyillen)\b/i

const ORDER_DELAY_PATTERN =
  /\b(\d+\s*(day|days|week|weeks|month|months)|oru\s+month|one\s+month|kayinj|delayed|late|ippo\s+\d+\s+month)\b/i

const ORDER_URGENCY_PATTERN =
  /\b(pettann|urgent|urgently|asap|fast(er)?|quickly|soon\s+as\s+possible|vehnam\s+eppo|eppo\s+kittum)\b/i

const ORDER_PAYMENT_PATTERN =
  /\b(payment\s+(pending|status|done)|paid|cod|cash\s+on\s+delivery)\b/i

const ORDER_ITEMS_PATTERN =
  /\b(items?\s+in\s+(the\s+)?order|what\s+(did\s+i|was)\s+order|order\s+items?|product\s+in\s+(the\s+)?order)\b/i

const ORDER_CANCEL_PATTERN =
  /\b(cancel\s+(my\s+)?order|order\s+cancel|cancel\s+cheyy|റദ്ദ്)\b/i

const ORDER_ADDRESS_PATTERN =
  /\b(change\s+(the\s+)?address|wrong\s+address|address\s+maar|update\s+address)\b/i

const ORDER_NOT_MINE_PATTERN =
  /\b(not\s+my\s+order|wrong\s+order|ithu\s+ente\s+order\s+alla|this\s+isn'?t\s+my\s+order)\b/i

const ORDER_REFUND_PATTERN =
  /\b(refund\s+(veh|ven|cheyy|please)|refund\s+vehnam|enick\s+refund|want\s+(a\s+)?refund|money\s+back)\b/i

const ORDER_FULL_PATTERN =
  /\b(order\s+details?|full\s+(order\s+)?(details?|status)|order\s+status)\b/i

const OFF_TOPIC_PATTERN =
  /\b(read\s+(this\s+)?pdf|read\s+this\s+file|open\s+this\s+link|who\s+(built|made|created)\s+(this|the)\s+(app|website|bot)|what\s+is\s+ai|tell\s+me\s+a\s+joke|news\s+today)\b/i

const ORDER_NUMBER_PATTERN = /\b([A-Z]{3}\d{2}-\d+)\b/i

const ORDER_STATUS_PATTERN =
  /\b(my\s+orders?|last\s+order|recent\s+order|all\s+(my\s+)?orders?|total\s+orders?|how\s+many\s+orders?|order\s+status|order\s+update|where\s+is\s+(my\s+)?order|track(ing)?(\s+my\s+order|\s+number|\s+id)?|shipped|delivery\s+status|payment\s+status|order\s+number|order\s+no\.?|order\s+#|ordered|order\s+evide|kittiyilla|kitteela|ella\s+orders?|orders?\s+okke)\b|എവിടെ|ഓർഡർ|ഓര്‍ഡര്‍/i

/**
 * Customer wants a list / count of all orders under their number — not only the last one.
 */
const ALL_ORDERS_SCOPE_PATTERN =
  /\b(all\s+(my\s+)?orders?|my\s+orders\b|total\s+orders?|how\s+many\s+orders?|orders?\s+list|list\s+(my\s+)?orders?|ella\s+orders?|orders?\s+okke|orders?\s+ellam|ente\s+orders(?:\s+ellam)?\b|njangalude\s+orders?|എല്ലാ\s*ഓർഡർ|ഓർഡറുകൾ)\b/i

/** Words that mean "track an existing order" rather than "I want to order". */
const ORDER_TRACKING_WORD_PATTERN =
  /\b(status|track(ing)?|shipped|shipping|delivered|dispatch(ed)?|where|evide|kittiyilla|kitteela|update)\b|എവിടെ|കിട്ടി|ട്രാക്ക്/i

const ORDER_PRODUCT_PATTERN =
  /\b(?:my|the|where\s+is)\s+(?:\w+\s+){0,3}order\b|\border\s+(?:for|with|of)\s+/i

const SIZE_PATTERN = /\b(x{0,2}[sml]|xxl|xxxl|small|medium|large|extra\s*large)\b/i
const SIZE_MAP: Record<string, string> = {
  small: 'S',
  s: 'S',
  medium: 'M',
  m: 'M',
  large: 'L',
  l: 'L',
  xl: 'XL',
  xxl: 'XXL',
  xxxl: 'XXXL',
  'extra large': 'XL',
}

const COLOR_WORDS = [
  'black', 'white', 'blue', 'red', 'green', 'yellow', 'pink', 'purple',
  'orange', 'brown', 'grey', 'gray', 'navy', 'beige', 'maroon', 'cream', 'gold', 'silver',
]

const MALAYALAM_COLOR_MAP: Record<string, string> = {
  വെള്ള: 'White',
  വെള്ളം: 'White',
  velutha: 'White',
  vella: 'White',
  നീല: 'Blue',
  neela: 'Blue',
  കറുപ്പ്: 'Black',
  karuppu: 'Black',
  പച്ച: 'Green',
  pacha: 'Green',
  ചുവപ്പ്: 'Red',
  chuvappu: 'Red',
}

const CATEGORY_WORDS = [
  't-shirt', 'tshirt', 'tee-shirt', 'tees', 'tee',
  'shirts', 'shirt',
  'trousers', 'trouser', 'pants', 'pant', 'jeans',
  'dresses', 'dress', 'kurta', 'saree', 'sari', 'tops', 'top',
  'jackets', 'jacket', 'shoes', 'shoe', 'beanie', 'benny', 'innerwear',
]

const CATEGORY_GROUPS: Record<string, string[]> = {
  tshirts: ['t-shirt', 'tshirt', 'tee-shirt', 'tees', 'tee'],
  shirts: ['shirts', 'shirt'],
  pants: ['trousers', 'trouser', 'pants', 'pant', 'jeans'],
  dresses: ['dresses', 'dress'],
  kurtas: ['kurta'],
  sarees: ['saree', 'sari'],
  tops: ['tops', 'top'],
  jackets: ['jackets', 'jacket'],
  shoes: ['shoes', 'shoe'],
  beanies: ['beanie', 'benny'],
  innerwear: ['innerwear'],
}

const BUY_SIGNAL_PATTERN =
  /\b(need|want|send|show|photo|image|picture|pic|pair|looking\s+for|undo|undu|vendath|vendam|koodi|ayackavo|ayakkavo|ayakku)\b|pantsinte|pair\s*cheyy|ഉണ്ടോ/i

const PRODUCT_CORRECTION_PATTERN =
  /\b(ith(u)?\s+\S+\s+alle|alle\s+enick|not\s+(this|that|it)|this\s+is\s+not|i\s+asked\s+for|vendath\s+ith|aahn\s+vendath)\b/i

export function isProductCorrectionMessage(text: string): boolean {
  return PRODUCT_CORRECTION_PATTERN.test(text.trim())
}

const OWNERSHIP_PATTERN =
  /\b(have|already\s+own|own|kayyil|ente\s+kayyil|kayyil\s+oru|ond|undu)\b/i

type CategoryHit = {
  word: string
  canonical: string
  index: number
  end: number
  fromStore?: boolean
}

function detectLanguageFromText(text: string): string {
  return detectLanguageAndScript(text).language
}

/**
 * Script to answer in. A Malayalam customer typing Latin letters gets Manglish
 * back; Malayalam script only when they used Malayalam script themselves.
 */
function resolveScriptStyle(text: string, language: string): ScriptStyle {
  const detected = detectLanguageAndScript(text)
  if (detected.scriptStyle === 'malayalam_script') return 'malayalam_script'
  if (language.trim().toLowerCase() === 'malayalam') return 'latin'
  return detected.scriptStyle
}

function isGreetingOnly(text: string): boolean {
  return GREETING_ONLY_PATTERN.test(text.trim())
}

function isAcknowledgement(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (EMOJI_ONLY_PATTERN.test(trimmed)) return true
  return ACK_PATTERN.test(trimmed)
}

function isBuyIntent(text: string): boolean {
  return BUY_INTENT_PATTERN.test(text.trim())
}

function isLanguageMetaQuestion(text: string): boolean {
  const trimmed = text.trim()
  if (isLanguageSwitchMessage(trimmed) && !LANGUAGE_META_PATTERN.test(trimmed)) return false
  return LANGUAGE_META_PATTERN.test(trimmed)
}

export function isLanguageSwitchMessage(text: string): boolean {
  const trimmed = text.trim()
  if (LANGUAGE_META_PATTERN.test(trimmed) && !LANGUAGE_SWITCH_PATTERN.test(trimmed)) return false
  if (LANGUAGE_META_PATTERN.test(trimmed) && /\b(do\s+you\s+know|can\s+you\s+speak|അറിയാമോ)\b/i.test(trimmed)) {
    return false
  }
  return LANGUAGE_SWITCH_PATTERN.test(trimmed)
}

export function isRefuseMessage(text: string): boolean {
  return REFUSE_PATTERN.test(text.trim())
}

export function isBarePriceAsk(text: string): boolean {
  return BARE_PRICE_PATTERN.test(text.trim())
}

export function isDeliveryAskWithoutOrder(text: string, sessionTopic: SessionTopic): boolean {
  if (sessionTopic === 'order') return false
  const trimmed = text.trim()
  return ORDER_ETA_PATTERN.test(trimmed) || ORDER_URGENCY_PATTERN.test(trimmed)
}

export function detectSessionTopic(lines?: ConversationHistoryLine[]): SessionTopic {
  if (!lines?.length) return null
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]
    if (line.role !== 'store') continue
    if (
      /\bOrder number\s*:/i.test(line.text) ||
      /\border status\b/i.test(line.text) ||
      /\bee orderil\b/i.test(line.text) ||
      /\bunfulfilled aanu\b/i.test(line.text) ||
      /\border\s+[A-Z]{3}\d{2}-\d+\b/i.test(line.text) ||
      /\b[A-Z]{3}\d{2}-\d+\b/.test(line.text)
    ) {
      return 'order'
    }
    if (/https?:\/\/\S*\/product\//i.test(line.text)) return 'product'
    if (/\b(illa|don't keep|do not (?:keep|sell)|not available)\b/i.test(line.text)) return 'missing'
  }
  return null
}

function alreadySentOrderBlock(lines?: ConversationHistoryLine[]): boolean {
  if (!lines?.length) return false
  return lines.some((line) => line.role === 'store' && /\bOrder number\s*:/i.test(line.text))
}

export function resolveOrderAsk(
  text: string,
  sessionTopic: SessionTopic = null,
  sentFullBlock = false
): OrderAsk | null {
  const trimmed = text.trim()
  if (ORDER_CANCEL_PATTERN.test(trimmed)) return 'cancel'
  if (ORDER_NOT_MINE_PATTERN.test(trimmed)) return 'not_mine'
  if (ORDER_ADDRESS_PATTERN.test(trimmed)) return 'address'
  if (ORDER_REFUND_PATTERN.test(trimmed) && !ORDER_DELAY_PATTERN.test(trimmed)) return 'refund'
  if (ORDER_CONFIRM_LAST_PATTERN.test(trimmed)) return 'confirm_last'
  if (ORDER_DELAY_PATTERN.test(trimmed)) return 'delay'
  if (ORDER_WHY_PATTERN.test(trimmed)) return 'why'
  if (ORDER_URGENCY_PATTERN.test(trimmed)) return 'urgency'
  if (ORDER_ETA_PATTERN.test(trimmed)) return 'eta'
  if (ORDER_PAYMENT_PATTERN.test(trimmed) && !isBuyIntent(trimmed)) return 'payment'
  if (ORDER_ITEMS_PATTERN.test(trimmed)) return 'items'
  if (ORDER_FULL_PATTERN.test(trimmed)) return sentFullBlock ? 'confirm_last' : 'full'
  if (sessionTopic === 'order' || sentFullBlock) {
    if (ORDER_ETA_PATTERN.test(trimmed) || ORDER_URGENCY_PATTERN.test(trimmed)) {
      return ORDER_URGENCY_PATTERN.test(trimmed) ? 'urgency' : 'eta'
    }
    if (isOrderStatusMessage(trimmed)) return 'confirm_last'
    return 'items'
  }
  if (isOrderStatusMessage(trimmed)) return 'full'
  return null
}

function isOrderFollowUpMessage(
  text: string,
  sessionTopic: SessionTopic,
  namedAProduct = false
): boolean {
  if (namedAProduct) return false
  const trimmed = text.trim()
  if (isAcknowledgement(trimmed) || isGreetingOnly(trimmed)) return false
  if (ORDER_CONFIRM_LAST_PATTERN.test(trimmed)) return true
  if (ORDER_CANCEL_PATTERN.test(trimmed) || ORDER_NOT_MINE_PATTERN.test(trimmed) || ORDER_ADDRESS_PATTERN.test(trimmed)) {
    return true
  }
  if (isPlacedOrderComplaint(trimmed)) return true
  if (sessionTopic !== 'order') return false
  return true
}

export type ShopInfoAsk =
  | 'location'
  | 'hours'
  | 'delivery'
  | 'payment'
  | 'returns'
  | 'offers'
  | 'general'

export function isPlacedOrderComplaint(text: string): boolean {
  const trimmed = text.trim()
  const aboutPlacedOrder =
    /\b(ith(u)?\s+order|order\s+cheyth|already\s+\d+|ente\s+order|last\s+order|my\s+order)\b/i.test(
      trimmed
    )
  return (
    aboutPlacedOrder &&
    (ORDER_DELAY_PATTERN.test(trimmed) ||
      ORDER_ETA_PATTERN.test(trimmed) ||
      ORDER_REFUND_PATTERN.test(trimmed) ||
      ORDER_WHY_PATTERN.test(trimmed))
  )
}

export function resolveShopInfoAsk(text: string): ShopInfoAsk {
  const trimmed = text.trim()
  if (SHOP_LOCATION_PATTERN.test(trimmed)) return 'location'
  if (SHOP_HOURS_PATTERN.test(trimmed)) return 'hours'
  if (SHOP_OFFER_PATTERN.test(trimmed)) return 'offers'
  if (SHOP_RETURNS_PATTERN.test(trimmed)) return 'returns'
  if (SHOP_PAYMENT_PATTERN.test(trimmed)) return 'payment'
  if (SHOP_DELIVERY_POLICY_PATTERN.test(trimmed)) return 'delivery'
  return 'general'
}

export function isShopInfoMessage(text: string, sessionTopic: SessionTopic): boolean {
  const trimmed = text.trim()
  if (isPlacedOrderComplaint(trimmed)) return false
  if (/\border\s+evide\b/i.test(trimmed)) return false
  if (SHOP_LOCATION_PATTERN.test(trimmed) || SHOP_HOURS_PATTERN.test(trimmed)) return true
  if (sessionTopic === 'order') return false
  return SHOP_INFO_PATTERN.test(trimmed)
}

function languageFromSwitchRequest(text: string): string | null {
  const lower = text.toLowerCase()
  if (/malayalam|malayalathil|മലയാള/.test(lower)) return 'Malayalam'
  if (/\bhindi\b|hindiil|हिंदी/.test(lower)) return 'Hindi'
  if (/\btamil\b|tamilil|தமிழ்/.test(lower)) return 'Tamil'
  if (/englishil|\benglish\b/.test(lower)) return 'English'
  return null
}

function lastRequestedReplyLanguage(
  lines?: ConversationHistoryLine[]
): string | null {
  if (!lines?.length) return null
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]
    if (line.role !== 'customer') continue
    if (!isLanguageSwitchMessage(line.text)) continue
    return languageFromSwitchRequest(line.text)
  }
  return null
}

function resolveReplyLanguage(input: {
  trimmed: string
  detected: string
  recentMessages?: ConversationHistoryLine[]
  switchLanguage?: string | null
}): string {
  if (input.switchLanguage) return input.switchLanguage
  const shortAck = /^(ok(ay)?|thanks|thank you|sheri|ശരി)[\s!.,]*$/i.test(input.trimmed)
  if (shortAck || isAcknowledgement(input.trimmed)) {
    const stuck = lastRequestedReplyLanguage(input.recentMessages)
    if (stuck) return stuck
  }
  return input.detected
}

function isOffTopicMessage(text: string): boolean {
  return OFF_TOPIC_PATTERN.test(text.trim())
}

function extractSku(text: string): string | null {
  const compact = text.match(/\b((?:sku|item)[-_][a-z0-9]+(?:[-_][a-z0-9]+)*)\b/i)
  if (compact?.[1]) return compact[1]

  const labeled = text.match(/\b(?:sku|item)\b\s*(?:#|:)?\s*([a-z0-9]+(?:-[a-z0-9]+)*)/i)
  if (labeled?.[1] && !/^(?:sku|item)$/i.test(labeled[1])) return labeled[1]

  return extractBareProductCode(text)
}

/** A message that is only a product code, never "ok", "hi", or an order number. */
function extractBareProductCode(text: string): string | null {
  const trimmed = text.trim()
  if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/.test(trimmed)) return null
  if (ORDER_NUMBER_PATTERN.test(trimmed)) return null
  if (/^(?:ok|okay|hi|hey|hello)(?:-[A-Za-z0-9]+)*$/i.test(trimmed)) return null
  return trimmed
}

function extractSize(text: string): string | null {
  const match = text.match(SIZE_PATTERN)
  if (!match) return null
  const raw = match[1].toLowerCase()
  return SIZE_MAP[raw] ?? raw.toUpperCase()
}

function extractColor(text: string): string | null {
  const lower = text.toLowerCase()
  for (const color of COLOR_WORDS) {
    if (new RegExp(`\\b${color}\\b`, 'i').test(lower)) {
      return color.charAt(0).toUpperCase() + color.slice(1)
    }
  }
  for (const [word, color] of Object.entries(MALAYALAM_COLOR_MAP)) {
    if (text.includes(word) || lower.includes(word.toLowerCase())) {
      return color
    }
  }
  return null
}

function isTshirtTerm(term: string): boolean {
  return /\bt[- ]?shirts?\b|\btshirts?\b|\btee[- ]?shirts?\b|\btees?\b/i.test(term)
}

function canonicalCategory(term: string): string | null {
  const lower = term.toLowerCase().trim()
  if (!lower) return null
  if (isTshirtTerm(lower)) return 'tshirts'
  for (const [canonical, words] of Object.entries(CATEGORY_GROUPS)) {
    if (canonical === 'tshirts') continue
    if (words.some((w) => lower === w)) return canonical
  }
  for (const [canonical, words] of Object.entries(CATEGORY_GROUPS)) {
    if (canonical === 'tshirts' || canonical === 'shirts') continue
    if (words.some((w) => lower.includes(w))) return canonical
  }
  if (/\bshirts?\b/i.test(lower) && !isTshirtTerm(lower)) return 'shirts'
  return null
}

function categoryWordPattern(cat: string): RegExp {
  const base = cat.replace('-', '[- ]?')
  return new RegExp(`\\b${base}s?(?:inte|nte|um)?\\b`, 'gi')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function storeCategoryStem(name: string): string {
  return name.replace(/s$/i, '').toLowerCase()
}

function tokenMatchesStoreCategory(token: string, categoryName: string): boolean {
  const stem = storeCategoryStem(categoryName)
  const t = token.toLowerCase()
  if (!t || t.length < 3) return false
  if (t === stem || t === `${stem}s` || t === categoryName.toLowerCase()) return true
  if (t.length >= 4 && stem.length >= 4 && t.slice(0, 4) === stem.slice(0, 4)) return true
  if (
    t.length >= 4 &&
    stem.length >= 4 &&
    Math.abs(t.length - stem.length) <= 2 &&
    t.slice(0, 3) === stem.slice(0, 3)
  ) {
    return true
  }
  if (stem.startsWith(t) || t.startsWith(stem)) return true
  return false
}

function findStoreCategoryHits(text: string, storeCategories: string[]): CategoryHit[] {
  const hits: CategoryHit[] = []
  const names = [...new Set(storeCategories.map((name) => name.trim()).filter((name) => name.length >= 2))]
    .sort((a, b) => b.length - a.length)
  const lower = text.toLowerCase()
  for (const name of names) {
    const stem = name.replace(/s$/i, '')
    const token = escapeRegExp(stem.length >= 2 ? stem : name).replace(/[-\s]+/g, '[- ]?')
    const re = new RegExp(`\\b${token}s?\\b`, 'gi')
    let match: RegExpExecArray | null
    while ((match = re.exec(lower)) !== null) {
      hits.push({
        word: name,
        canonical: name,
        index: match.index,
        end: match.index + match[0].length,
        fromStore: true,
      })
    }
  }
  const tokenRe = /[\p{L}\p{N}]+/gu
  let tokenMatch: RegExpExecArray | null
  while ((tokenMatch = tokenRe.exec(lower)) !== null) {
    const token = tokenMatch[0]
    const tokenIndex = tokenMatch.index
    for (const name of names) {
      if (!tokenMatchesStoreCategory(token, name)) continue
      const already = hits.some(
        (hit) => hit.fromStore && hit.canonical === name && hit.index === tokenIndex
      )
      if (already) continue
      hits.push({
        word: name,
        canonical: name,
        index: tokenIndex,
        end: tokenIndex + token.length,
        fromStore: true,
      })
    }
  }
  return hits
}

function findCategoryHits(text: string, storeCategories: string[] = []): CategoryHit[] {
  const lower = text.toLowerCase()
  const hits: CategoryHit[] = []
  for (const cat of CATEGORY_WORDS) {
    const re = categoryWordPattern(cat)
    let match: RegExpExecArray | null
    while ((match = re.exec(lower)) !== null) {
      const canonical = canonicalCategory(cat)
      if (!canonical) continue
      hits.push({
        word: cat,
        canonical,
        index: match.index,
        end: match.index + match[0].length,
      })
    }
  }
  hits.push(...findStoreCategoryHits(text, storeCategories))
  hits.sort((a, b) => a.index - b.index || Number(b.fromStore) - Number(a.fromStore) || b.word.length - a.word.length)
  const deduped: CategoryHit[] = []
  for (const hit of hits) {
    const overlapAt = deduped.findIndex((d) => hit.index < d.end && hit.end > d.index)
    if (overlapAt < 0) {
      deduped.push(hit)
      continue
    }
    const kept = deduped[overlapAt]
    const hitSpan = hit.end - hit.index
    const keptSpan = kept.end - kept.index
    if (hitSpan > keptSpan || (hitSpan === keptSpan && hit.fromStore && !kept.fromStore)) {
      deduped[overlapAt] = hit
    }
  }
  return deduped
}

function windowScore(text: string, index: number, end: number): number {
  const start = Math.max(0, index - 36)
  const stop = Math.min(text.length, end + 48)
  const window = text.slice(start, stop)
  let score = 0
  if (BUY_SIGNAL_PATTERN.test(window)) score += 4
  if (ownershipInWindow(window)) score -= 5
  return score
}

/** "I have a marriage" is an occasion, not a product the customer already owns. */
function ownershipInWindow(window: string): boolean {
  const withoutOccasion = window.replace(
    /\bhave\s+(?:a\s+|an\s+)?(?:marriage|wedding|party|function|birthday|engagement|reception)\b/gi,
    ' '
  )
  return OWNERSHIP_PATTERN.test(withoutOccasion)
}

export function extractRequestedCategory(
  text: string,
  storeCategories: string[] = []
): string | null {
  const hits = findCategoryHits(text, storeCategories)
  if (hits.length === 0) return null
  if (hits.length === 1) return hits[0].canonical

  const either = /\bor\b|അല്ലെങ്കിൽ/i.test(text)
  const scoreHit = (hit: CategoryHit) =>
    windowScore(text, hit.index, hit.end) + (hit.fromStore ? 2 : 0)
  let best = hits[0]
  let bestScore = scoreHit(best)
  for (const hit of hits.slice(1)) {
    const score = scoreHit(hit)
    const tie = score === bestScore
    const preferThis =
      score > bestScore ||
      (tie && (either ? hit.index < best.index : hit.index > best.index))
    if (preferThis) {
      best = hit
      bestScore = score
    }
  }
  return best.canonical
}

function extractCategory(text: string, storeCategories: string[] = []): string | null {
  return (
    extractRequestedCategory(text, storeCategories) ??
    findCategoryHits(text, storeCategories)[0]?.canonical ??
    null
  )
}

/** Other products they named with "or", after the one we search first. */
export function extractAlternativeCategories(
  text: string,
  storeCategories: string[] = []
): string[] {
  if (!/\bor\b|അല്ലെങ്കിൽ/i.test(text)) return []
  const primary = extractRequestedCategory(text, storeCategories)
  if (!primary) return []
  const seen = new Set<string>([primary])
  const alternatives: string[] = []
  for (const hit of findCategoryHits(text, storeCategories)) {
    if (seen.has(hit.canonical)) continue
    if (windowScore(text, hit.index, hit.end) < 0) continue
    seen.add(hit.canonical)
    alternatives.push(hit.canonical)
  }
  return alternatives
}

export function categorySearchTerm(canonical: string): string {
  if (canonical === 'tshirts') return 't-shirt'
  const words = CATEGORY_GROUPS[canonical]
  if (!words?.length) return canonical
  return [...words].sort((a, b) => a.length - b.length)[0]
}

function primarySearchTerm(
  text: string,
  canonical: string,
  storeCategories: string[] = []
): string {
  const words = findCategoryHits(text, storeCategories)
    .filter((hit) => hit.canonical === canonical)
    .map((hit) => hit.word)
  if (words.length === 0) return categorySearchTerm(canonical)
  return [...words].sort((a, b) => a.length - b.length)[0]
}

const IDENTITY_FILLER = new Set([
  'hi', 'hello', 'hey', 'helo', 'please', 'sir', 'saar', 'sar', 'thanks', 'thank', 'you',
  'ok', 'okay', 'aah', 'aa', 'ee', 'mm', 'the', 'a', 'an', 'my', 'me', 'i', 'we', 'this', 'that',
  'oru', 'njan', 'enick', 'enikku', 'ente', 'ithu', 'athu', 'athinte', 'athin', 'ithin',
  'vendath', 'vendam', 'vehnam', 'aahn', 'aanu', 'undo', 'undu', 'ond', 'illa', 'alle',
  'details', 'detail', 'photo', 'image', 'images', 'picture', 'pic', 'video', 'message',
  'kanditt', 'cheyyavahn', 'ayakku', 'ayackava', 'ayakkavo', 'send', 'show', 'need', 'want',
  'looking', 'for', 'have', 'do', 'with', 'from', 'and', 'or', 'also', 'only', 'just',
  'pair', 'koodi', 'olla', 'cheyyan', 'pattiya', 'kayyil', 'inte', 'okke', 'order', 'status',
  'where', 'is', 'last', 'recent', 'the', 'any', 'some', 'one', 'so', 'because',
  'marriage', 'wedding', 'party', 'tomorrow', 'today', 'tonight', 'birthday', 'gift',
  'function', 'engagement', 'reception',
])

function isIdentityFiller(token: string, color: string | null): boolean {
  const t = token.toLowerCase()
  if (IDENTITY_FILLER.has(t)) return true
  if (color && t === color.toLowerCase()) return true
  if (COLOR_WORDS.includes(t)) return true
  if (t.length <= 5 && SIZE_PATTERN.test(t)) return true
  return false
}

function richerProductPhrase(
  a: string | null | undefined,
  b: string | null | undefined
): string | null {
  const left = a?.trim() ?? ''
  const right = b?.trim() ?? ''
  if (!left) return right || null
  if (!right) return left
  const ln = left.split(/\s+/).length
  const rn = right.split(/\s+/).length
  if (ln !== rn) return ln > rn ? left : right
  return left.length >= right.length ? left : right
}

function coreSearchWord(hit: CategoryHit, matched: string): string {
  const slice = matched.replace(/(inte|nte|um)$/i, '').toLowerCase()
  if (hit.fromStore) return slice || hit.word.toLowerCase()
  if (hit.canonical === 'tshirts' || isTshirtTerm(slice)) return 't-shirt'
  return slice || categorySearchTerm(hit.canonical)
}

function hitMatchesCategory(hit: CategoryHit, category: string): boolean {
  if (hit.canonical === category || hit.word.toLowerCase() === category.toLowerCase()) return true
  const want = canonicalCategory(category)
  return Boolean(want && (hit.canonical === want || canonicalCategory(hit.canonical) === want))
}

/** Style/brand words next to the product type, e.g. "check shirt" not "shirt". */
export function productIdentityQuery(
  text: string,
  category: string | null,
  storeCategories: string[] = []
): string {
  const color = extractColor(text)
  const hits = findCategoryHits(text, storeCategories)
  const hit = category
    ? hits.find((row) => hitMatchesCategory(row, category)) ?? hits[0]
    : hits[0]
  const tokens = [...text.matchAll(/[A-Za-z][A-Za-z0-9-]*/g)].map((m) => ({
    token: m[0],
    index: m.index ?? 0,
  }))

  if (!hit) {
    return tokens
      .map((row) => row.token.toLowerCase())
      .filter((tok) => tok.length >= 3 && !isIdentityFiller(tok, color))
      .slice(0, 4)
      .join(' ')
  }

  const matched = text.slice(hit.index, hit.end)
  const core = coreSearchWord(hit, matched)
  const before = tokens.filter((row) => row.index + row.token.length <= hit.index)
  const modifiers: string[] = []
  for (let i = before.length - 1; i >= 0 && modifiers.length < 2; i -= 1) {
    const tok = before[i].token
    if (isIdentityFiller(tok, color) || tok.length < 3) {
      if (modifiers.length > 0) break
      continue
    }
    modifiers.unshift(tok.toLowerCase())
  }
  return [...modifiers, core].join(' ').trim()
}

function mentionsOccasion(text: string): boolean {
  return OCCASION_PATTERN.test(text)
}

function preferTextSearchQuery(
  text: string,
  query: string,
  category: string | null,
  storeCategories: string[] = []
): string {
  const cleaned = query
    .replace(
      /\b(marriage|wedding|party|tomorrow|birthday|gift|function|engagement|reception)\b|വിവാഹം|കല്യാണം/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()
  const identity = productIdentityQuery(text, category, storeCategories)
  if (category && categoriesConflict(cleaned, category)) {
    return identity || primarySearchTerm(text, category, storeCategories)
  }
  const usableLlm = cleaned && cleaned.split(/\s+/).length <= 6 ? cleaned : ''
  return (
    richerProductPhrase(identity, usableLlm) ||
    identity ||
    usableLlm ||
    (category ? primarySearchTerm(text, category, storeCategories) : '')
  )
}

function isColorOnlyFollowUp(text: string, storeCategories: string[] = []): boolean {
  if (
    extractRequestedCategory(text, storeCategories) ||
    extractSku(text) ||
    isOrderStatusMessage(text)
  ) {
    return false
  }
  const color = extractColor(text)
  if (!color) return false
  const rest = text
    .replace(new RegExp(color, 'ig'), ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b(color|colour|please|sir|saar)\b/gi, ' ')
    .trim()
  return rest.length === 0
}

function categoryFromSession(
  lines: ConversationHistoryLine[] | undefined,
  current: string,
  storeCategories: string[] = []
): string | null {
  if (!lines?.length) return null
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]
    if (line.role !== 'customer') continue
    if (line.text.trim() === current.trim()) continue
    const category = extractRequestedCategory(line.text, storeCategories)
    if (category) return category
  }
  return null
}

function colorFollowUpIntent(
  trimmed: string,
  recentMessages?: ConversationHistoryLine[],
  storeCategories: string[] = []
): ParsedCustomerIntent | null {
  if (isProductCorrectionMessage(trimmed)) return null
  if (!isColorOnlyFollowUp(trimmed, storeCategories)) return null
  const categoryName = categoryFromSession(recentMessages, trimmed, storeCategories)
  if (!categoryName) return null
  return finalizeIntent(
    {
      intent: 'product_search',
      customerLanguage: detectLanguageFromText(trimmed),
      searchQuery: categorySearchTerm(categoryName),
      color: extractColor(trimmed),
      size: extractSize(trimmed),
      sku: null,
      categoryName,
      wantsImage: wantsImageFromText(trimmed),
      orderNumber: null,
      orderNumberHint: null,
      orderProductHint: null,
      orderScope: null,
      orderAsk: null,
      typedPhone: null,
      sessionTopic: detectSessionTopic(recentMessages),
      missingWhy: null,
    },
    trimmed,
    storeCategories
  )
}

export function extractRequestedColor(text: string, requestedCategory: string | null): string | null {
  const color = extractColor(text)
  if (!color || !requestedCategory) return color

  const hits = findCategoryHits(text)
  const otherHits = hits.filter((h) => h.canonical !== requestedCategory)
  if (otherHits.length === 0) return color

  const lower = text.toLowerCase()
  const colorIdx = lower.search(new RegExp(`\\b${color.toLowerCase()}\\b`, 'i'))
  const malayalamIdx = Object.entries(MALAYALAM_COLOR_MAP).reduce((found, [word]) => {
    if (found >= 0) return found
    return text.indexOf(word) >= 0 ? text.indexOf(word) : lower.indexOf(word.toLowerCase())
  }, -1)
  const idx = colorIdx >= 0 ? colorIdx : malayalamIdx
  if (idx < 0) return color

  const requestedHits = hits.filter((h) => h.canonical === requestedCategory)
  const distToRequested = requestedHits.length
    ? Math.min(...requestedHits.map((h) => Math.abs(h.index - idx)))
    : Number.POSITIVE_INFINITY
  const distToOther = Math.min(...otherHits.map((h) => Math.abs(h.index - idx)))

  if (distToOther < distToRequested) return null
  return color
}

export function categoriesConflict(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a ? canonicalCategory(a) : null
  const right = b ? canonicalCategory(b) : null
  return Boolean(left && right && left !== right)
}

function stripExtractedTerms(text: string, color: string | null, size: string | null): string {
  let q = text
  if (color) q = q.replace(new RegExp(`\\b${color}\\b`, 'gi'), ' ')
  if (size) q = q.replace(SIZE_PATTERN, ' ')
  q = q.replace(
    /\b(photo|image|picture|pic|send|show|want|need|looking\s+for|do\s+you\s+have|price|how\s+much|wedding|marriage|party|tomorrow|birthday|gift|function|engagement|reception|undo|undu|ഉണ്ടോ|ഇല്ല)\b|വിവാഹം|കല്യാണം/gi,
    ' '
  )
  return q.replace(/\s+/g, ' ').trim()
}

function wantsImageFromText(text: string): boolean {
  return /\b(photo|images?|picture|pic|send\s+me|show\s+me|ayackavo|ayakkavo|ayakku)\b/i.test(text)
}

export function extractOrderNumber(text: string): string | null {
  const explicit = text.match(
    /\b(?:order\s*(?:#|no\.?|number)?\s*[:#-]?\s*)([A-Z]{3}\d{2}-\d+)\b/i
  )
  if (explicit?.[1]) return explicit[1].toUpperCase()
  const bare = text.match(ORDER_NUMBER_PATTERN)
  return bare?.[1]?.toUpperCase() ?? null
}

export function extractOrderNumberHint(text: string): string | null {
  if (extractOrderNumber(text)) return null
  const match = text.match(/\border\s*(?:#|no\.?|number)?\s*[:#-]?\s*(\d{1,6})\b/i)
  return match?.[1] ?? null
}

export function extractPhoneFromText(text: string): string | null {
  const withoutOrders = text.replace(ORDER_NUMBER_PATTERN, ' ')
  const match = withoutOrders.match(/(?:^|[^\d])(\d{10,15})(?:[^\d]|$)/)
  return match?.[1] ?? null
}

export function isOrderStatusMessage(text: string): boolean {
  const trimmed = text.trim()
  return (
    ORDER_STATUS_PATTERN.test(trimmed) ||
    ALL_ORDERS_SCOPE_PATTERN.test(trimmed) ||
    extractOrderNumber(text) !== null ||
    extractOrderNumberHint(text) !== null
  )
}

export function isAllOrdersScopeMessage(text: string): boolean {
  return ALL_ORDERS_SCOPE_PATTERN.test(text.trim())
}

export function extractOrderProductHint(text: string): string | null {
  const stripped = text
    .replace(ORDER_NUMBER_PATTERN, ' ')
    .replace(
      /\b(my|last|recent|the|where|is|order|status|tracking|track|shipped|delivery|payment|update|number|no|for|with|of|a|an)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()

  const category = extractCategory(stripped)
  const identity = productIdentityQuery(text, category, [])
  if (identity) return identity

  const words = stripped
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !IDENTITY_FILLER.has(w.toLowerCase()))
  return words.length > 0 ? words.join(' ') : null
}

export function resolveOrderScope(
  text: string,
  orderNumber: string | null,
  orderProductHint: string | null
): OrderScope | null {
  if (orderNumber || extractOrderNumberHint(text)) return 'specific'
  if (isAllOrdersScopeMessage(text)) return 'all'
  if (orderProductHint && ORDER_PRODUCT_PATTERN.test(text)) return 'product'
  if (/\b(last|recent)\s+order\b/i.test(text) && !orderProductHint) return 'latest'
  if (/\bmy\s+order\b/i.test(text) && !orderProductHint) return 'latest'
  if (isOrderStatusMessage(text)) return 'latest'
  return null
}

function buildRequestedItem(
  searchQuery: string,
  color: string | null,
  size: string | null,
  categoryName: string | null
): string | null {
  const parts: string[] = []
  if (color) parts.push(color.toLowerCase())
  if (searchQuery.trim()) parts.push(searchQuery.trim())
  else if (categoryName) parts.push(categoryName)
  if (size) parts.push(`size ${size}`)
  return parts.join(' ').trim() || null
}

function normalizeIntent(
  intent: CustomerIntent,
  hasProductSignals: boolean,
  hasCatalogSignals: boolean
): CustomerIntent {
  if (
    intent === 'order_status' ||
    intent === 'refuse' ||
    intent === 'language_switch' ||
    intent === 'shop_info'
  ) {
    return intent
  }
  if (intent === 'off_topic' && hasProductSignals) return 'product_search'
  // "ok" is a reaction, but "ok blue shirt undo?" names a new product.
  if ((intent === 'acknowledgement' || intent === 'buy_intent') && hasCatalogSignals) {
    return 'product_search'
  }
  return intent
}

function finalizeIntent(
  partial: Omit<
    ParsedCustomerIntent,
    | 'requestedItem'
    | 'orderNumberHint'
    | 'typedPhone'
    | 'scriptStyle'
    | 'alternativeCategories'
    | 'orderAsk'
    | 'sessionTopic'
    | 'missingWhy'
    | 'rejectsLastShown'
    | 'replyToLastQuestion'
  > & {
    requestedItem?: string | null
    orderNumberHint?: string | null
    typedPhone?: string | null
    scriptStyle?: ScriptStyle
    orderAsk?: OrderAsk | null
    sessionTopic?: SessionTopic
    missingWhy?: MissingWhy | null
    rejectsLastShown?: boolean
    replyToLastQuestion?: LastQuestionAnswer
  },
  trimmed: string,
  storeCategories: string[] = [],
  recentMessages?: ConversationHistoryLine[]
): ParsedCustomerIntent {
  const hasCatalogSignals = Boolean(
    partial.searchQuery.trim() ||
      partial.color ||
      partial.sku ||
      partial.categoryName
  )

  const hasProductSignals = Boolean(
    hasCatalogSignals ||
      partial.size ||
      partial.intent === 'product_search' ||
      partial.intent === 'image_request' ||
      partial.intent === 'sku_lookup' ||
      partial.intent === 'category_search'
  )

  const intent = normalizeIntent(partial.intent, hasProductSignals, hasCatalogSignals)

  // Reactions and order questions carry no product, so they must never leak a
  // stale searchQuery into the catalog lookup (that is what turned "ok" into a
  // "we don't have ok" reply).
  const isNonCatalog = NON_CATALOG_INTENTS.has(intent)

  const requestedItem =
    intent === 'language_switch'
      ? partial.requestedItem?.trim() || null
      : isNonCatalog
        ? null
        : partial.requestedItem?.trim() ||
          buildRequestedItem(partial.searchQuery, partial.color, partial.size, partial.categoryName) ||
          (partial.searchQuery.trim() || null)

  const detected = detectLanguageAndScript(trimmed)
  const customerLanguage = resolveReplyLanguage({
    trimmed,
    detected:
      partial.customerLanguage?.trim() && partial.customerLanguage !== 'Unknown'
        ? partial.customerLanguage.trim()
        : detected.language,
    recentMessages,
    switchLanguage: intent === 'language_switch' ? languageFromSwitchRequest(trimmed) : null,
  })

  return {
    ...partial,
    intent,
    customerLanguage,
    scriptStyle: partial.scriptStyle ?? resolveScriptStyle(trimmed, customerLanguage),
    requestedItem,
    searchQuery: isNonCatalog ? '' : partial.searchQuery.trim(),
    color: isNonCatalog ? null : partial.color?.trim() || null,
    size: partial.size?.trim()?.toUpperCase() || null,
    sku: isNonCatalog ? null : partial.sku?.trim() || null,
    categoryName: isNonCatalog ? null : partial.categoryName?.trim() || null,
    orderNumber: partial.orderNumber?.trim()?.toUpperCase() || null,
    orderNumberHint: partial.orderNumberHint?.trim() || null,
    orderProductHint: partial.orderProductHint?.trim() || null,
    orderScope: partial.orderScope ?? null,
    orderAsk: partial.orderAsk ?? null,
    typedPhone: partial.typedPhone?.trim() || null,
    sessionTopic: partial.sessionTopic ?? null,
    missingWhy: partial.missingWhy ?? null,
    rejectsLastShown: isNonCatalog ? false : isProductCorrectionMessage(trimmed),
    replyToLastQuestion: partial.replyToLastQuestion ?? null,
    alternativeCategories: isNonCatalog
      ? []
      : extractAlternativeCategories(trimmed, storeCategories),
  }
}

export function fromLlmResult(
  parsed: LlmIntentResult,
  trimmed: string,
  storeCategories: string[] = [],
  recentMessages?: ConversationHistoryLine[]
): ParsedCustomerIntent {
  const requestedCategory = extractRequestedCategory(trimmed, storeCategories)
  const colorFromText = extractRequestedColor(trimmed, requestedCategory)
  const sizeFromText = extractSize(trimmed)
  const categoryFromText = requestedCategory || extractCategory(trimmed, storeCategories)
  const skuFromText = extractSku(trimmed)
  const orderNumberFromText = extractOrderNumber(trimmed)
  const orderNumberHintFromText = extractOrderNumberHint(trimmed)
  const typedPhoneFromText = extractPhoneFromText(trimmed)
  const orderProductHintFromText = extractOrderProductHint(trimmed)

  const llmCategory = parsed.categoryName?.trim() || null
  let categoryName = requestedCategory || llmCategory || categoryFromText

  const size = parsed.size?.trim()?.toUpperCase() || sizeFromText
  const orderNumber = parsed.orderNumber?.trim()?.toUpperCase() || orderNumberFromText
  const orderNumberHint = parsed.orderNumberHint?.trim() || orderNumberHintFromText
  const typedPhone = parsed.typedPhone?.trim() || typedPhoneFromText
  const orderProductHint = richerProductPhrase(
    orderProductHintFromText,
    parsed.orderProductHint?.trim() || null
  )

  // The message itself is the authority on whether a product was named. When the
  // customer only reacted ("ok"), the LLM sometimes carries the previous product
  // over from history — that produced replies about products they never re-asked for.
  const sessionTopic = detectSessionTopic(recentMessages)
  const mentionsProduct = Boolean(requestedCategory || colorFromText || skuFromText)
  const looksLikeOrderQuestion =
    isOrderStatusMessage(trimmed) ||
    isOrderFollowUpMessage(trimmed, sessionTopic, mentionsProduct)
  const reactionOnly = !mentionsProduct && !looksLikeOrderQuestion && !isRefuseMessage(trimmed) && !isLanguageSwitchMessage(trimmed)
  let intent: CustomerIntent =
    isRefuseMessage(trimmed)
      ? 'refuse'
      : isLanguageSwitchMessage(trimmed)
        ? 'language_switch'
        : looksLikeOrderQuestion
          ? 'order_status'
          : reactionOnly && isAcknowledgement(trimmed)
            ? 'acknowledgement'
            : reactionOnly && isBuyIntent(trimmed)
              ? 'buy_intent'
              : parsed.intent ?? 'product_search'

  if (intent === 'off_topic' && isLanguageSwitchMessage(trimmed)) intent = 'language_switch'
  if (isShopInfoMessage(trimmed, sessionTopic) && !mentionsProduct) {
    intent = WHAT_WE_SELL_PATTERN.test(trimmed) ? 'greeting' : 'shop_info'
  }
  if (isProductCorrectionMessage(trimmed) && mentionsProduct) {
    intent = 'product_search'
  }

  // Code owns what an answer to our own offer means: yes is a buy ask for that
  // product (checkout link), no is a polite stop. Neither places an order.
  // The model often returns product_search + a stale searchQuery and leaves
  // replyToLastQuestion null — that re-sent the product card after "yes".
  const openOffer = extractOpenOffer(recentMessages ?? [])
  let replyToLastQuestion = openOffer
    ? normalizeLastQuestionAnswer(parsed.replyToLastQuestion)
    : null
  if (
    openOffer &&
    !mentionsProduct &&
    !looksLikeOrderQuestion &&
    !isLanguageSwitchMessage(trimmed) &&
    !isShopInfoMessage(trimmed, sessionTopic)
  ) {
    if (replyToLastQuestion === 'no' || isRefuseMessage(trimmed)) {
      intent = 'refuse'
      replyToLastQuestion = 'no'
    } else if (replyToLastQuestion === 'yes' || isShortReplyToOffer(trimmed)) {
      intent = 'buy_intent'
      replyToLastQuestion = 'yes'
    }
  }

  const llmConflicts =
    Boolean(requestedCategory) &&
    (categoriesConflict(parsed.searchQuery, requestedCategory) ||
      categoriesConflict(llmCategory, requestedCategory))

  let color = llmConflicts
    ? colorFromText
    : parsed.color?.trim() || colorFromText

  if (intent === 'buy_intent' && !mentionsProduct) {
    categoryName = null
    color = colorFromText
  }

  const searchQuery = NON_CATALOG_INTENTS.has(intent)
    ? ''
    : preferTextSearchQuery(
        trimmed,
        llmConflicts && requestedCategory
          ? requestedCategory
          : parsed.searchQuery?.trim() ||
            stripExtractedTerms(trimmed, color, size) ||
            categoryName ||
            '',
        requestedCategory || categoryName,
        storeCategories
      )

  const orderScope =
    parsed.orderScope ??
    (intent === 'order_status'
      ? resolveOrderScope(trimmed, orderNumber, orderProductHint)
      : null)

  const orderAsk =
    intent === 'order_status'
      ? parsed.orderAsk ?? resolveOrderAsk(trimmed, sessionTopic, alreadySentOrderBlock(recentMessages))
      : null

  const switchLanguage =
    intent === 'language_switch' ? languageFromSwitchRequest(trimmed) : null

  return finalizeIntent(
    {
      intent,
      customerLanguage:
        switchLanguage ?? parsed.customerLanguage ?? detectLanguageFromText(trimmed),
      requestedItem:
        intent === 'language_switch'
          ? categoryFromSession(recentMessages, trimmed, storeCategories) ||
            parsed.requestedItem?.trim() ||
            null
          : llmConflicts
            ? buildRequestedItem(searchQuery, color, size, categoryName)
            : parsed.requestedItem ?? null,
      searchQuery,
      color,
      size,
      sku: intent === 'buy_intent' && !mentionsProduct ? null : parsed.sku?.trim() || skuFromText,
      categoryName,
      wantsImage: parsed.wantsImage === true || wantsImageFromText(trimmed),
      orderNumber,
      orderNumberHint,
      orderProductHint,
      orderScope,
      orderAsk,
      typedPhone,
      sessionTopic,
      replyToLastQuestion,
    },
    trimmed,
    storeCategories,
    recentMessages
  )
}

function normalizeLastQuestionAnswer(value: unknown): LastQuestionAnswer {
  const answer = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (answer === 'yes') return 'yes'
  if (answer === 'no') return 'no'
  return null
}

/** Short reply with no new product, e.g. a one-word answer to our offer. */
function isShortReplyToOffer(trimmed: string): boolean {
  return trimmed.split(/\s+/).filter(Boolean).length <= 3
}

/**
 * Regex-only classification. Used when the LLM is unavailable, when the message
 * needs no classification (bare reactions), and by fixtures.
 */
export function parseCustomerIntentOffline(
  text: string,
  options?: ParseCustomerIntentOptions
): ParsedCustomerIntent {
  const trimmed = text.trim()
  const followUp = colorFollowUpIntent(
    trimmed,
    options?.recentMessages,
    options?.storeCategories
  )
  if (followUp) return followUp
  return regexFallback(trimmed, options?.storeCategories, options?.recentMessages)
}

function regexFallback(
  trimmed: string,
  storeCategories: string[] = [],
  recentMessages?: ConversationHistoryLine[]
): ParsedCustomerIntent {
  const skuFromText = extractSku(trimmed)
  const categoryFromText = extractCategory(trimmed, storeCategories)
  const colorFromText = extractRequestedColor(trimmed, categoryFromText)
  const sizeFromText = extractSize(trimmed)
  const detectedLang = detectLanguageFromText(trimmed)
  const sessionTopic = detectSessionTopic(recentMessages)

  if (isRefuseMessage(trimmed) && !categoryFromText && !skuFromText) {
    return finalizeIntent(
      {
        intent: 'refuse',
        customerLanguage: detectedLang,
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
        sessionTopic,
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  if (isLanguageSwitchMessage(trimmed)) {
    const lastCategory = categoryFromSession(recentMessages, trimmed, storeCategories)
    return finalizeIntent(
      {
        intent: 'language_switch',
        customerLanguage: languageFromSwitchRequest(trimmed) ?? detectedLang,
        requestedItem: lastCategory,
        searchQuery: '',
        color: null,
        size: null,
        sku: null,
        categoryName: lastCategory,
        wantsImage: false,
        orderNumber: null,
        orderNumberHint: null,
        orderProductHint: null,
        orderScope: null,
        orderAsk: null,
        typedPhone: null,
        sessionTopic,
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  if (isLanguageMetaQuestion(trimmed)) {
    return finalizeIntent(
      {
        intent: 'off_topic',
        customerLanguage: detectedLang,
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
        typedPhone: null,
        sessionTopic,
        offTopicReason: 'language_meta',
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  if (isOffTopicMessage(trimmed) && !colorFromText && !categoryFromText) {
    return finalizeIntent(
      {
        intent: 'off_topic',
        customerLanguage: detectedLang,
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
        typedPhone: null,
        sessionTopic,
        offTopicReason: 'general',
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  if (isGreetingOnly(trimmed)) {
    return finalizeIntent(
      {
        intent: 'greeting',
        customerLanguage: detectedLang,
        searchQuery: '',
        color: null,
        size: null,
        sku: skuFromText,
        categoryName: null,
        wantsImage: false,
        orderNumber: null,
        orderNumberHint: null,
        orderProductHint: null,
        orderScope: null,
        typedPhone: null,
        sessionTopic,
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  if (isShopInfoMessage(trimmed, sessionTopic) && !skuFromText && !categoryFromText) {
    return finalizeIntent(
      {
        intent: WHAT_WE_SELL_PATTERN.test(trimmed) ? 'greeting' : 'shop_info',
        customerLanguage: detectedLang,
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
        typedPhone: null,
        sessionTopic,
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  const orderNumberFromText = extractOrderNumber(trimmed)

  if (sessionTopic === 'order' && ORDER_PAYMENT_PATTERN.test(trimmed) && !categoryFromText) {
    return finalizeIntent(
      {
        intent: 'order_status',
        customerLanguage: detectedLang,
        searchQuery: '',
        color: null,
        size: null,
        sku: null,
        categoryName: null,
        wantsImage: false,
        orderNumber: orderNumberFromText,
        orderNumberHint: extractOrderNumberHint(trimmed),
        orderProductHint: extractOrderProductHint(trimmed),
        orderScope: resolveOrderScope(trimmed, orderNumberFromText, extractOrderProductHint(trimmed)),
        orderAsk: 'payment',
        typedPhone: extractPhoneFromText(trimmed),
        sessionTopic,
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  // "ഓർഡർ ചെയ്യാം" / "how to order" is a customer wanting to buy, not asking
  // where an existing order is. ORDER_STATUS_PATTERN matches the bare word
  // "ഓർഡർ", so buy intent has to be checked first.
  if (
    isBuyIntent(trimmed) &&
    !orderNumberFromText &&
    !extractOrderNumberHint(trimmed) &&
    !ORDER_TRACKING_WORD_PATTERN.test(trimmed) &&
    sessionTopic !== 'order'
  ) {
    return finalizeIntent(
      {
        intent: 'buy_intent',
        customerLanguage: detectedLang,
        searchQuery: '',
        color: null,
        size: sizeFromText,
        sku: null,
        categoryName: null,
        wantsImage: false,
        orderNumber: null,
        orderNumberHint: null,
        orderProductHint: null,
        orderScope: null,
        typedPhone: null,
        sessionTopic,
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  if (
    (isOrderStatusMessage(trimmed) ||
      isOrderFollowUpMessage(trimmed, sessionTopic, Boolean(categoryFromText || skuFromText))) &&
    !categoryFromText &&
    !skuFromText
  ) {
    const orderProductHint = extractOrderProductHint(trimmed)
    const orderScope = resolveOrderScope(trimmed, orderNumberFromText, orderProductHint)
    return finalizeIntent(
      {
        intent: 'order_status',
        customerLanguage: detectedLang,
        searchQuery: '',
        color: null,
        size: null,
        sku: null,
        categoryName: null,
        wantsImage: false,
        orderNumber: orderNumberFromText,
        orderNumberHint: extractOrderNumberHint(trimmed),
        orderProductHint,
        orderScope,
        orderAsk: resolveOrderAsk(trimmed, sessionTopic, alreadySentOrderBlock(recentMessages)),
        typedPhone: extractPhoneFromText(trimmed),
        sessionTopic,
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  if (skuFromText) {
    return finalizeIntent(
      {
        intent: 'sku_lookup',
        customerLanguage: detectedLang,
        searchQuery: '',
        color: colorFromText,
        size: sizeFromText,
        sku: skuFromText,
        categoryName: categoryFromText,
        wantsImage: wantsImageFromText(trimmed),
        orderNumber: null,
        orderNumberHint: null,
        orderProductHint: null,
        orderScope: null,
        typedPhone: null,
        sessionTopic,
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  // Without the model we cannot read yes vs no, but a short reply to our open
  // offer is never a product search; the buy reply only points to the checkout link.
  if (
    extractOpenOffer(recentMessages ?? []) &&
    sessionTopic !== 'order' &&
    !categoryFromText &&
    !colorFromText &&
    isShortReplyToOffer(trimmed) &&
    !isBarePriceAsk(trimmed) &&
    !isDeliveryAskWithoutOrder(trimmed, sessionTopic) &&
    !isOrderStatusMessage(trimmed)
  ) {
    return finalizeIntent(
      {
        intent: 'buy_intent',
        customerLanguage: detectedLang,
        searchQuery: '',
        color: null,
        size: sizeFromText,
        sku: null,
        categoryName: null,
        wantsImage: false,
        orderNumber: null,
        orderNumberHint: null,
        orderProductHint: null,
        orderScope: null,
        typedPhone: null,
        sessionTopic,
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  // Reactions ("ok", "thanks") and buy asks ("order cheyyam") name no product.
  // Without this they fell through to product_search below with searchQuery "ok",
  // matched nothing, and produced a "we don't have ok" reply.
  if (!categoryFromText && !colorFromText && !skuFromText) {
    if (isAcknowledgement(trimmed) || isBuyIntent(trimmed)) {
      return finalizeIntent(
        {
          intent: isAcknowledgement(trimmed) ? 'acknowledgement' : 'buy_intent',
          customerLanguage: detectedLang,
          searchQuery: '',
          color: null,
          size: sizeFromText,
          sku: null,
          categoryName: null,
          wantsImage: false,
          orderNumber: null,
          orderNumberHint: null,
          orderProductHint: null,
          orderScope: null,
          typedPhone: null,
          sessionTopic,
        },
        trimmed,
        storeCategories,
        recentMessages
      )
    }
  }

  if (sessionTopic === 'missing' && STOCK_WHY_PATTERN.test(trimmed) && !skuFromText) {
    const lastCategory = categoryFromText || categoryFromSession(recentMessages, trimmed, storeCategories)
    return finalizeIntent(
      {
        intent: 'product_search',
        customerLanguage: detectedLang,
        requestedItem: lastCategory,
        searchQuery: lastCategory ? categorySearchTerm(lastCategory) : '',
        color: null,
        size: null,
        sku: null,
        categoryName: lastCategory,
        wantsImage: false,
        orderNumber: null,
        orderNumberHint: null,
        orderProductHint: null,
        orderScope: null,
        orderAsk: null,
        typedPhone: null,
        sessionTopic,
        missingWhy: 'not_sold',
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  if (isBarePriceAsk(trimmed) && !categoryFromText && !skuFromText) {
    return finalizeIntent(
      {
        intent: 'product_search',
        customerLanguage: detectedLang,
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
        sessionTopic,
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  if (
    isDeliveryAskWithoutOrder(trimmed, sessionTopic) &&
    !categoryFromText &&
    !skuFromText
  ) {
    return finalizeIntent(
      {
        intent: 'acknowledgement',
        customerLanguage: detectedLang,
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
        orderAsk: ORDER_URGENCY_PATTERN.test(trimmed) ? 'urgency' : 'eta',
        typedPhone: null,
        sessionTopic: sessionTopic ?? 'product',
      },
      trimmed,
      storeCategories,
      recentMessages
    )
  }

  const searchQuery = preferTextSearchQuery(
    trimmed,
    stripExtractedTerms(trimmed, colorFromText, sizeFromText) ||
      (categoryFromText ? primarySearchTerm(trimmed, categoryFromText, storeCategories) : ''),
    categoryFromText,
    storeCategories
  )

  return finalizeIntent(
    {
      intent: 'product_search',
      customerLanguage: detectedLang,
      searchQuery,
      color: colorFromText,
      size: sizeFromText,
      sku: null,
      categoryName: categoryFromText,
      wantsImage: wantsImageFromText(trimmed),
      orderNumber: null,
      orderNumberHint: null,
      orderProductHint: null,
      orderScope: null,
      typedPhone: null,
      sessionTopic,
    },
    trimmed,
    storeCategories,
    recentMessages
  )
}

function buildIntentPrompt(
  text: string,
  recentMessages?: ConversationHistoryLine[],
  storeCategories?: string[]
): string {
  const departments = storeCategories?.filter(Boolean) ?? []
  const shopLine = departments.length
    ? `This shop's departments (search only these; this shop is not always clothing): ${departments.join(', ')}\n\n`
    : ''
  if (!recentMessages?.length) {
    return `${shopLine}Latest customer message:\n${text}`.trim()
  }
  const offer = extractOpenOffer(recentMessages)
  const offerLine = offer
    ? `Our last question to the customer (about ${offer.title}): ${offer.question}\n\n`
    : ''
  const customerOnly = recentMessages.filter((m) => m.role === 'customer')
  const history = (customerOnly.length > 0 ? customerOnly : recentMessages)
    .map((m) => `${m.role === 'customer' ? 'Customer' : 'Store'}: ${m.text}`)
    .join('\n')
  return `${shopLine}Recent conversation (customer messages only — for follow-ups like color-only replies). Latest message product type overrides earlier products:\n${history}\n\n${offerLine}Latest customer message:\n${text}`
}

export async function parseCustomerIntent(
  text: string,
  options?: ParseCustomerIntentOptions
): Promise<ParsedCustomerIntent> {
  const trimmed = text.trim()
  const storeCategories = options?.storeCategories ?? []
  if (!trimmed) {
    return finalizeIntent(
      {
        intent: 'off_topic',
        customerLanguage: 'English',
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
        typedPhone: null,
        offTopicReason: 'general',
      },
      trimmed,
      storeCategories,
      options?.recentMessages
    )
  }

  if (isLanguageMetaQuestion(trimmed)) {
    return regexFallback(trimmed, storeCategories, options?.recentMessages)
  }

  const sessionTopic = detectSessionTopic(options?.recentMessages)
  if (
    isRefuseMessage(trimmed) ||
    isLanguageSwitchMessage(trimmed) ||
    isOrderFollowUpMessage(
      trimmed,
      sessionTopic,
      Boolean(extractRequestedCategory(trimmed, storeCategories) || extractSku(trimmed))
    ) ||
    isDeliveryAskWithoutOrder(trimmed, sessionTopic) ||
    isBarePriceAsk(trimmed) ||
    isShopInfoMessage(trimmed, sessionTopic)
  ) {
    return regexFallback(trimmed, storeCategories, options?.recentMessages)
  }

  // A bare reaction needs no classification, and skipping the LLM stops it from
  // carrying the previous product over from history. After our own offer the
  // model must read it, because "ok" may be the answer to that question.
  if (
    !extractOpenOffer(options?.recentMessages ?? []) &&
    isAcknowledgement(trimmed) &&
    !extractRequestedCategory(trimmed, storeCategories) &&
    !extractColor(trimmed) &&
    !extractSku(trimmed) &&
    !isOrderStatusMessage(trimmed)
  ) {
    return regexFallback(trimmed, storeCategories, options?.recentMessages)
  }

  if (
    isGreetingOnly(trimmed) &&
    !extractRequestedCategory(trimmed, storeCategories) &&
    !extractColor(trimmed) &&
    !extractSku(trimmed) &&
    !isOrderStatusMessage(trimmed)
  ) {
    return regexFallback(trimmed, storeCategories, options?.recentMessages)
  }

  const followUp = colorFollowUpIntent(
    trimmed,
    options?.recentMessages,
    storeCategories
  )
  if (followUp) return followUp

  const llmInput = buildIntentPrompt(trimmed, options?.recentMessages, storeCategories)
  const parsed = await completeJson<LlmIntentResult>(INTENT_SCHEMA, llmInput)
  if (parsed?.intent && parsed.customerLanguage) {
    const result = fromLlmResult(parsed, trimmed, storeCategories, options?.recentMessages)
    if (result.intent === 'language_switch') return result
    if (parsed.intent === 'off_topic' && isLanguageMetaQuestion(trimmed)) {
      return { ...result, offTopicReason: 'language_meta' }
    }
    if (parsed.intent === 'off_topic') {
      return { ...result, offTopicReason: 'general' }
    }
    return result
  }

  if (parsed?.intent) {
    return fromLlmResult(
      { ...parsed, customerLanguage: parsed.customerLanguage ?? detectLanguageFromText(trimmed) },
      trimmed,
      storeCategories,
      options?.recentMessages
    )
  }

  return regexFallback(trimmed, storeCategories, options?.recentMessages)
}
