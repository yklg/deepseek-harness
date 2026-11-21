/**
 * PII redaction for page text read from the console guest. A draft prompt must
 * carry the shop's visible page content without carrying customer or order
 * identities, so this module masks mainland mobile numbers, 18-digit ID cards,
 * order/shipment numbers, and addresses before any copy leaves the browser.
 *
 * One pass over the text replaces every match with a marker, so a marker is
 * never rescanned and one category cannot mask another's digits: the order and
 * address prefixes are matched before bare digit runs, and ID cards before
 * phones. The counts tell the user how much was removed.
 *
 * @module @deepseek-ai/dsh-client-ui-workbench/src/client/pii
 */

/** Categories one page-text scan counts. */
export interface PiiCounts {
  /** Masked mainland mobile numbers. */
  readonly phone: number
  /** Masked 18-digit ID cards. */
  readonly idCard: number
  /** Masked order, shipment, courier, and parcel numbers. */
  readonly order: number
  /** Masked addresses. */
  readonly address: number
  /** Sum of every category. */
  readonly total: number
}

/** Page text after redaction, with the per-category masks the UI reports. */
export interface PiiRedaction {
  /** Text with every recognized value replaced by its marker. */
  readonly text: string
  /** How many values of each category were masked. */
  readonly counts: PiiCounts
}

/** Marker that replaces each redacted category. */
const MARKERS = {
  phone: '[手机号]',
  idCard: '[身份证]',
  order: '[单号]',
  address: '[地址]',
} as const

/** One redaction category, named after its marker entry. */
type PiiKind = keyof typeof MARKERS

/**
 * The one-pass redaction pattern. Alternatives are ordered so that the more
 * specific context wins over a bare digit run:
 * 1. order/shipment field names keep their label and lose the value;
 * 2. ID cards are consumed whole before any 11-digit slice can look like a phone;
 * 3. address field names mask the rest of the line;
 * 4. phones require a non-digit boundary on both sides.
 */
const PII_PATTERN = new RegExp([
  String.raw`(?<orderPrefix>(?:订单|运单|快递|包裹)号?[:：]?\s*)(?<orderValue>[A-Za-z0-9-]{8,32})`,
  String.raw`(?<![\dA-Za-z])(?<idCard>\d{17}[\dXx])(?![\dA-Za-z])`,
  String.raw`(?<addressPrefix>(?:收货地址|详细地址|地址)[:：]\s*)(?<addressValue>[^\n]{6,})`,
  String.raw`(?<phone>(?<!\d)1[3-9]\d{9}(?!\d))`,
].join('|'), 'gu')

/**
 * @param groups - named groups captured by {@link PII_PATTERN}; only the group of the matched alternative is set.
 * @returns the category of the alternative that matched.
 */
function matchedKind(groups: RegExpExecArray['groups']): PiiKind {
  if (groups?.['orderValue'] !== undefined) return 'order'
  if (groups?.['idCard'] !== undefined) return 'idCard'
  if (groups?.['addressValue'] !== undefined) return 'address'
  return 'phone'
}

/**
 * @param kind - category of the match.
 * @param match - the matched text and its named groups.
 * @returns the replacement text; order and address keep the field name they matched.
 */
function replacementFor(kind: PiiKind, match: RegExpExecArray): string {
  switch (kind) {
    case 'phone':
      return MARKERS.phone
    case 'idCard':
      return MARKERS.idCard
    case 'order':
      return `${match.groups?.['orderPrefix'] ?? ''}${MARKERS.order}`
    case 'address':
      return `${match.groups?.['addressPrefix'] ?? ''}${MARKERS.address}`
  }
}

/**
 * Mask the personal data a console page shows.
 * @param text - visible page text as the guest reported it; empty or PII-free text is returned unchanged.
 * @returns the redacted text and the counts of each masked category.
 */
export function redactPii(text: string): PiiRedaction {
  const counts = { phone: 0, idCard: 0, order: 0, address: 0, total: 0 }
  let redacted = ''
  let cursor = 0
  PII_PATTERN.lastIndex = 0
  let match = PII_PATTERN.exec(text)
  while (match !== null) {
    const kind = matchedKind(match.groups)
    redacted += text.slice(cursor, match.index) + replacementFor(kind, match)
    counts[kind] += 1
    counts.total += 1
    cursor = match.index + match[0].length
    match = PII_PATTERN.exec(text)
  }
  return { text: redacted + text.slice(cursor), counts }
}
