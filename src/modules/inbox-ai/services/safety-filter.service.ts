const EXPLICIT_PATTERNS = [
  /\b(porn|nude|naked|sex|xxx|nsfw)\b/i,
  /\b(fuck|shit|bitch|asshole)\b/i,
]

const CODE_PATTERNS = [
  /\b(source\s*code|api\s*key|password|secret|system\s*prompt)\b/i,
  /\b(give\s+me\s+(the\s+)?source\s*code|show\s+me\s+(the\s+)?source\s*code)\b/i,
  /\b(give\s+me\s+(the\s+)?api\s*key)\b/i,
]

export type SafetyBlockReason = 'explicit' | 'code_request' | 'off_topic'

export type SafetyResult = { allowed: true } | { allowed: false; reason: SafetyBlockReason }

export function checkMessageSafety(text: string): SafetyResult {
  const trimmed = text.trim()
  if (!trimmed) return { allowed: false, reason: 'off_topic' }

  for (const pattern of EXPLICIT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: 'explicit' }
    }
  }

  for (const pattern of CODE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: 'code_request' }
    }
  }

  return { allowed: true }
}
