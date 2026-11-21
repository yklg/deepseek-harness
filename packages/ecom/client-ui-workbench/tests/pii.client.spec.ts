/** PII redaction: phone, ID card, order/shipment, address, boundaries, and cross-category safety. */
import { describe, expect, it } from 'vitest'
import { redactPii } from '../src/client/pii.ts'

/** Counts of a PII-free scan, used as the base of every expected count object. */
const NO_COUNTS = { phone: 0, idCard: 0, order: 0, address: 0, total: 0 }

describe('PII redaction', () => {
  it('masks a mainland mobile number with the phone marker', () => {
    const result = redactPii('买家电话 13800138000，请回拨。')
    expect(result.text).toBe('买家电话 [手机号]，请回拨。')
    expect(result.counts).toEqual({ ...NO_COUNTS, phone: 1, total: 1 })
  })

  it('leaves longer digit runs intact instead of masking a phone slice', () => {
    const text = '流水号 138001380001 与 21380013800。'
    const result = redactPii(text)
    expect(result.text).toBe(text)
    expect(result.counts).toEqual(NO_COUNTS)
  })

  it('masks an 18-digit ID card including a trailing X and counts no phone inside it', () => {
    const result = redactPii('身份证号：11010119900307123X')
    expect(result.text).toBe('身份证号：[身份证]')
    expect(result.counts).toEqual({ ...NO_COUNTS, idCard: 1, total: 1 })
  })

  it('does not count an 11-digit slice of a pure-digit ID card as a phone', () => {
    const result = redactPii('证件 110101199003071234 已核验')
    expect(result.text).toBe('证件 [身份证] 已核验')
    expect(result.counts).toEqual({ ...NO_COUNTS, idCard: 1, total: 1 })
  })

  it('masks order and shipment numbers while keeping their field names', () => {
    const result = redactPii('订单号：202401011234567890\n运单号 SF1234567890')
    expect(result.text).toBe('订单号：[单号]\n运单号 [单号]')
    expect(result.counts).toEqual({ ...NO_COUNTS, order: 2, total: 2 })
  })

  it('treats a long number after an order field as an order number, not an ID card', () => {
    const result = redactPii('订单号：202401011234567890')
    expect(result.text).toBe('订单号：[单号]')
    expect(result.counts).toEqual({ ...NO_COUNTS, order: 1, total: 1 })
  })

  it('masks the rest of an address line while keeping the field name', () => {
    const result = redactPii('收货地址：北京市朝阳区建国路 88 号院 3 号楼')
    expect(result.text).toBe('收货地址：[地址]')
    expect(result.counts).toEqual({ ...NO_COUNTS, address: 1, total: 1 })
  })

  it('keeps unrelated lines and masks one value per line across multiple lines', () => {
    const text = [
      '今日直播商品：山茶花面膜',
      '客服手机 13912345678',
      '收货地址：上海市浦东新区世纪大道 1 号',
    ].join('\n')
    const result = redactPii(text)
    expect(result.text).toBe('今日直播商品：山茶花面膜\n客服手机 [手机号]\n收货地址：[地址]')
    expect(result.counts).toEqual({ phone: 1, idCard: 0, order: 0, address: 1, total: 2 })
  })

  it('returns PII-free text unchanged with zero counts', () => {
    const text = '今天上架新品，直播间满 200 减 20。'
    const result = redactPii(text)
    expect(result.text).toBe(text)
    expect(result.counts).toEqual(NO_COUNTS)
  })

  it('returns empty text unchanged with zero counts', () => {
    const result = redactPii('')
    expect(result.text).toBe('')
    expect(result.counts).toEqual(NO_COUNTS)
  })
})
