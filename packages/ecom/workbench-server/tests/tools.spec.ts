/** Draft tools and the high-risk approval policy. */
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { PreToolDecision, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { afterEach, describe, expect, it } from 'vitest'
import { Config, WorkbenchService } from '../src/index.ts'
import type { WorkbenchChannel } from '../src/channel.ts'
import { installApprovalPolicy } from '../src/tools.ts'

const unavailable: WorkbenchChannel = {
  status: { available: false, connected: false },
  request: async () => { throw new Error('automation unavailable in this test') },
  onEvent: () => () => undefined,
  onStatusChange: () => () => undefined,
  dispose: () => undefined,
}

class TestWorkbench extends WorkbenchService {
  constructor(ctx: Context, config: Config) {
    super(ctx, config, unavailable)
  }
}

const contexts: Context[] = []
const signal = new AbortController().signal

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
})

async function harness(config: Partial<Config> = {}): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(TestWorkbench, Config(config))
  return ctx
}

async function run(ctx: Context, name: string, args: unknown): Promise<ToolExecutionResult> {
  return await executeToolFixture(ctx, {
    signal,
    callId: ToolCallId(`call-${name}`),
    name,
    arguments: args,
  })
}

function value(result: ToolExecutionResult): NonNullable<ToolExecutionResult['value']> {
  expect(result.isError).toBe(false)
  if (result.isError) throw new Error(`tool failed: ${JSON.stringify(result.content)}`)
  const content = result.value
  if (content === undefined) throw new Error('tool returned no value')
  return content as NonNullable<ToolExecutionResult['value']>
}

describe('workbench draft tools', () => {
  it('composes a timed product script draft', async () => {
    const ctx = await harness()
    const draft = value(await run(ctx, 'ecom_draft_product_script', {
      productName: '  Winter coat  ',
      sellingPoints: ['Warm lining', 'Machine washable'],
      audience: 'commuters',
      durationSeconds: 120,
      tone: 'warm',
    })) as {
      kind: string
      draftOnly: boolean
      productName: string
      durationSeconds: number
      sections: { label: string; startSeconds: number; endSeconds: number; text: string }[]
    }
    expect(draft.kind).toBe('product-script')
    expect(draft.draftOnly).toBe(true)
    expect(draft.productName).toBe('Winter coat')
    expect(draft.sections).toHaveLength(4)
    expect(draft.sections[0]).toMatchObject({ label: 'opening', startSeconds: 0 })
    expect(draft.sections[0]?.text).toContain('commuters')
    expect(draft.sections[1]?.text).toBe('Warm lining')
    expect(draft.sections.at(-1)).toMatchObject({ label: 'close', endSeconds: 120 })
    for (let index = 1; index < draft.sections.length; index += 1) {
      expect(draft.sections[index]?.startSeconds).toBe(draft.sections[index - 1]?.endSeconds)
    }
  })

  it('rejects a script without usable product facts', async () => {
    const ctx = await harness()
    for (const args of [
      { productName: ' ', sellingPoints: ['one'] },
      { productName: 'P', sellingPoints: [] },
      { productName: 'P', sellingPoints: ['one'], durationSeconds: 10 },
      {
        productName: 'P',
        sellingPoints: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'],
        durationSeconds: 15,
      },
    ]) {
      const result = await run(ctx, 'ecom_draft_product_script', args)
      expect(result.isError).toBe(true)
    }
  })

  it('normalizes quick replies and refuses duplicate triggers', async () => {
    const ctx = await harness()
    const draft = value(await run(ctx, 'ecom_draft_quick_replies', {
      name: 'Restock',
      replies: [{ trigger: 'When restock?', reply: 'Tomorrow at ten.' }, { trigger: 'Size?', reply: 'See the chart.' }],
    })) as { kind: string; draftOnly: boolean; replies: { trigger: string; reply: string }[] }
    expect(draft.kind).toBe('quick-replies')
    expect(draft.draftOnly).toBe(true)
    expect(draft.replies).toHaveLength(2)
    const duplicate = await run(ctx, 'ecom_draft_quick_replies', {
      name: 'Restock',
      replies: [{ trigger: 'When restock?', reply: 'A' }, { trigger: 'when restock?', reply: 'B' }],
    })
    expect(duplicate.isError).toBe(true)
  })

  it('formats one comment reply draft', async () => {
    const ctx = await harness()
    const draft = value(await run(ctx, 'ecom_draft_comment_reply', {
      comment: 'Is it wool?',
      reply: 'It is 80% wool.',
      tone: 'friendly',
    })) as { kind: string; draftOnly: boolean; comment: string; reply: string; tone?: string }
    expect(draft).toEqual({
      kind: 'comment-reply', draftOnly: true, comment: 'Is it wool?', reply: 'It is 80% wool.', tone: 'friendly',
    })
    expect((await run(ctx, 'ecom_draft_comment_reply', { comment: 'Q', reply: '   ' })).isError).toBe(true)
  })
})

describe('high-risk approval policy', () => {
  const exec = (name: string): never => ({ name, callId: ToolCallId('call'), arguments: {}, signal }) as never

  async function decide(name: string, requireApproval: boolean, downstream: PreToolDecision): Promise<PreToolDecision> {
    const ctx = new Context()
    contexts.push(ctx)
    installApprovalPolicy(ctx, requireApproval)
    return await ctx.waterfall('tools/pre-execute', exec(name), () => Promise.resolve(downstream))
  }

  it('asks the user before a high-risk action, after the downstream chain allows it', async () => {
    const decision = await decide('ecom_change_price', true, { kind: 'allow' })
    expect(decision).toMatchObject({ kind: 'ask' })
    if (decision.kind !== 'ask') throw new Error('expected ask')
    expect(decision.reason).toContain('ecom_change_price')
  })

  it('leaves ordinary tool calls and a disabled policy alone', async () => {
    await expect(decide('ecom_draft_comment_reply', true, { kind: 'allow' })).resolves.toEqual({ kind: 'allow' })
    await expect(decide('ecom_change_price', false, { kind: 'allow' })).resolves.toEqual({ kind: 'allow' })
  })

  it('preserves a downstream denial instead of asking', async () => {
    await expect(decide('ecom_send_message', true, { kind: 'deny', reason: 'blocked upstream' }))
      .resolves.toEqual({ kind: 'deny', reason: 'blocked upstream' })
  })
})
