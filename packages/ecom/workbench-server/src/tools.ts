/**
 * Model-facing workbench drafts and the approval policy for high-risk
 * storefront actions. Drafts never send, publish, or change a listing; the
 * policy asks the user before any tool that would.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'

/** Tool names whose calls change the storefront or message a viewer. */
export const HIGH_RISK_TOOL_NAMES: readonly string[] = [
  'ecom_send_message',
  'ecom_change_price',
  'ecom_set_listing',
  'ecom_set_inventory',
]

const HIGH_RISK = new Set(HIGH_RISK_TOOL_NAMES)

const DRAFT_ONLY_DESCRIPTION = ' Returns a draft only; nothing is sent, published, or changed.'

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`invalid ${field}: expected a string`)
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new Error(`invalid ${field}: expected a non-empty string`)
  if (trimmed.length > max) throw new Error(`invalid ${field}: expected at most ${String(max)} characters`)
  return trimmed
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) return undefined
  return text(value, field, max)
}

interface ScriptSection {
  readonly label: 'opening' | 'selling-point' | 'close'
  readonly startSeconds: number
  readonly endSeconds: number
  readonly text: string
}

/** Allocate a contiguous script timeline around the opening and close. */
function scriptSections(productName: string, sellingPoints: readonly string[], audience: string | undefined,
  durationSeconds: number): ScriptSection[] {
  const opening = Math.max(5, Math.round(durationSeconds * 0.15))
  const close = Math.max(5, Math.round(durationSeconds * 0.2))
  const sellingTotal = durationSeconds - opening - close
  if (sellingTotal < sellingPoints.length) {
    throw new Error('invalid durationSeconds: too short for one section per selling point')
  }
  const base = Math.floor(sellingTotal / sellingPoints.length)
  const remainder = sellingTotal - base * sellingPoints.length
  const sections: ScriptSection[] = [{
    label: 'opening', startSeconds: 0, endSeconds: opening,
    text: audience === undefined
      ? `Open by greeting the audience and naming ${productName}.`
      : `Open by greeting ${audience} and naming ${productName}.`,
  }]
  let start = opening
  sellingPoints.forEach((point, index) => {
    const length = base + (index === sellingPoints.length - 1 ? remainder : 0)
    sections.push({ label: 'selling-point', startSeconds: start, endSeconds: start + length, text: point })
    start += length
  })
  sections.push({
    label: 'close', startSeconds: start, endSeconds: durationSeconds,
    text: `Close by restating the offer for ${productName} and inviting questions.`,
  })
  return sections
}

/**
 * Register the three draft tools on the owning Host context.
 * @param ctx - Host context carrying the tool registry.
 */
export function registerWorkbenchTools(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'ecom_draft_product_script',
    description: 'Compose a timed product talk script from product facts for a live-commerce host to review.'
      + DRAFT_ONLY_DESCRIPTION,
    parameters: {
      productName: { type: 'string', required: true, description: 'Product name as shown to viewers.' },
      sellingPoints: {
        type: 'array',
        required: true,
        description: 'One to eight selling points; each becomes one script section.',
        items: { type: 'string' },
      },
      audience: { type: 'string', description: 'Audience the opening should address.' },
      durationSeconds: { type: 'integer', description: 'Target script length; defaults to 120 seconds.' },
      tone: { type: 'string', description: 'Optional tone label kept on the draft.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, enum: ['product-script'] },
          draftOnly: { type: 'boolean', required: true },
          productName: { type: 'string', required: true },
          durationSeconds: { type: 'integer', required: true },
          tone: { type: 'string' },
          sections: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string', required: true, enum: ['opening', 'selling-point', 'close'] },
                startSeconds: { type: 'integer', required: true },
                endSeconds: { type: 'integer', required: true },
                text: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.productName} (${String(value.durationSeconds)}s draft)\n`
          + value.sections.map(section => `${String(section.startSeconds)}-${String(section.endSeconds)}s `
            + `${section.label}: ${section.text}`).join('\n'),
      }],
    },
    execute(args) {
      const productName = text(args.productName, 'productName', 120)
      if (!Array.isArray(args.sellingPoints) || args.sellingPoints.length === 0 || args.sellingPoints.length > 8) {
        throw new Error('invalid sellingPoints: expected between 1 and 8 entries')
      }
      const sellingPoints = args.sellingPoints.map((point, index) => text(point, `sellingPoints[${String(index)}]`, 200))
      const audience = optionalText(args.audience, 'audience', 120)
      const tone = optionalText(args.tone, 'tone', 40)
      const durationSeconds = args.durationSeconds ?? 120
      if (!Number.isInteger(durationSeconds) || durationSeconds < 15 || durationSeconds > 600) {
        throw new Error('invalid durationSeconds: expected an integer between 15 and 600')
      }
      return Promise.resolve({
        kind: 'product-script' as const,
        draftOnly: true,
        productName,
        durationSeconds,
        ...tone === undefined ? {} : { tone },
        sections: scriptSections(productName, sellingPoints, audience, durationSeconds),
      })
    },
  })), 'ecom-workbench: product script draft')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'ecom_draft_quick_replies',
    description: 'Normalize a draft set of live-session quick replies, rejecting duplicate triggers.'
      + DRAFT_ONLY_DESCRIPTION,
    parameters: {
      name: { type: 'string', required: true, description: 'Name of this quick-reply set.' },
      replies: {
        type: 'array',
        required: true,
        description: 'One to twenty trigger/reply pairs.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            trigger: { type: 'string', required: true },
            reply: { type: 'string', required: true },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, enum: ['quick-replies'] },
          draftOnly: { type: 'boolean', required: true },
          name: { type: 'string', required: true },
          replies: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                trigger: { type: 'string', required: true },
                reply: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.name} (${String(value.replies.length)} drafts)\n`
          + value.replies.map(reply => `- ${reply.trigger}: ${reply.reply}`).join('\n'),
      }],
    },
    execute(args) {
      const name = text(args.name, 'name', 80)
      if (!Array.isArray(args.replies) || args.replies.length === 0 || args.replies.length > 20) {
        throw new Error('invalid replies: expected between 1 and 20 entries')
      }
      const seen = new Set<string>()
      const replies = args.replies.map((entry, index) => {
        const trigger = text(entry.trigger, `replies[${String(index)}].trigger`, 80)
        const reply = text(entry.reply, `replies[${String(index)}].reply`, 300)
        const key = trigger.toLowerCase()
        if (seen.has(key)) throw new Error(`invalid replies: duplicate trigger ${JSON.stringify(trigger)}`)
        seen.add(key)
        return { trigger, reply }
      })
      return Promise.resolve({ kind: 'quick-replies' as const, draftOnly: true, name, replies })
    },
  })), 'ecom-workbench: quick reply drafts')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'ecom_draft_comment_reply',
    description: 'Format a draft reply to one viewer comment for a live-commerce host to review and post manually.'
      + DRAFT_ONLY_DESCRIPTION,
    parameters: {
      comment: { type: 'string', required: true, description: 'Viewer comment being answered.' },
      reply: { type: 'string', required: true, description: 'Draft reply text.' },
      tone: { type: 'string', description: 'Optional tone label kept on the draft.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, enum: ['comment-reply'] },
          draftOnly: { type: 'boolean', required: true },
          comment: { type: 'string', required: true },
          reply: { type: 'string', required: true },
          tone: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Draft reply to "${value.comment}":\n${value.reply}`,
      }],
    },
    execute(args) {
      const comment = text(args.comment, 'comment', 1_000)
      const reply = text(args.reply, 'reply', 500)
      const tone = optionalText(args.tone, 'tone', 40)
      return Promise.resolve({
        kind: 'comment-reply' as const,
        draftOnly: true,
        comment,
        reply,
        ...tone === undefined ? {} : { tone },
      })
    },
  })), 'ecom-workbench: comment reply draft')
}

/**
 * Ask the user before any high-risk workbench action runs.
 * @param ctx - Host context carrying the tool pipeline.
 * @param requireApproval - deployment policy switch.
 */
export function installApprovalPolicy(ctx: Context, requireApproval: boolean): void {
  if (!requireApproval) return
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!HIGH_RISK.has(exec.name)) return next()
    const downstream = await next()
    if (downstream.kind !== 'allow') return downstream
    return {
      kind: 'ask',
      reason: `The workbench tool "${exec.name}" sends a message or changes the storefront; approve this single call.`,
    }
  })
}
