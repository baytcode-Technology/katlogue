/**
 * Shared script detection for merchant Chat with us and customer Chat Boat.
 * Manglish = Malayalam typed with Latin letters.
 */

export type ScriptStyle = 'malayalam_script' | 'latin' | 'other'

const MALAYALAM_SCRIPT = /[\u0D00-\u0D7F]/
const TAMIL_SCRIPT = /[\u0B80-\u0BFF]/
const DEVANAGARI_SCRIPT = /[\u0900-\u097F]/
const ARABIC_SCRIPT = /[\u0600-\u06FF]/

const MANGLISH_PATTERN =
  /\b(undo|undu|und|ond|onde|olla|ulla|illa|ille|aanu|aahn|aan|aano|vendam|vehnam|venam|vendath|ethra|ethrayaanu|vila|kittumo|kitteela|kittiyilla|ayakkavo|ayackavo|ayakku|cheyyam|cheyyan|cheyyamo|edukkam|koodi|entha|enthu|enik+|enick|ente|njan|ningal|pattiya|pattumo|sheri|seri|mathi|thaa|tharumo|adipoli|kollam|evide|eppo|ippo|sadhanam|saadhanam)\b/i

/** Formal translator Malayalam that should never go out as shop talk. */
const STIFF_MALAYALAM =
  /ഞങ്ങളുടെ സ്ഥാപനത്തിൽ|പ്രസ്തുത|ലഭ്യമാണ്|ആദരപൂർവ്വം|സ്വാഗതം ആശംസ/

export function detectLanguageAndScript(text: string): {
  language: string
  scriptStyle: ScriptStyle
} {
  if (MALAYALAM_SCRIPT.test(text)) {
    return { language: 'Malayalam', scriptStyle: 'malayalam_script' }
  }
  if (TAMIL_SCRIPT.test(text)) return { language: 'Tamil', scriptStyle: 'other' }
  if (DEVANAGARI_SCRIPT.test(text)) return { language: 'Hindi', scriptStyle: 'other' }
  if (ARABIC_SCRIPT.test(text)) return { language: 'Arabic', scriptStyle: 'other' }
  if (MANGLISH_PATTERN.test(text)) return { language: 'Malayalam', scriptStyle: 'latin' }
  return { language: 'English', scriptStyle: 'latin' }
}

export function hasMalayalamScript(text: string): boolean {
  return MALAYALAM_SCRIPT.test(text)
}

export function hasTamilScript(text: string): boolean {
  return TAMIL_SCRIPT.test(text)
}

export function hasDevanagariScript(text: string): boolean {
  return DEVANAGARI_SCRIPT.test(text)
}

export function isStiffTranslationMalayalam(text: string): boolean {
  return STIFF_MALAYALAM.test(text)
}

/** English how-to body for Help Center Malayalam-script wrap (lead is added in code). */
export function isEnglishSupportBodyValid(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (hasTamilScript(trimmed) || hasDevanagariScript(trimmed)) return false
  if (hasMalayalamScript(trimmed)) return false
  if (isStiffTranslationMalayalam(trimmed)) return false
  return true
}
