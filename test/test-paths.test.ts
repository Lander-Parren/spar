import { describe, expect, it } from 'vitest'
import { isTestPath } from '../src/core/test-paths.js'

describe('isTestPath', () => {
  it.each([
    'test/orders.test.ts',
    'tests/orders.test.ts',
    'src/orders/order.spec.ts',
    'src/__tests__/order.ts',
    '/work/app/OrderServiceTests.cs',
    '/work/app/OrderServiceTest.java',
    'spec/models/order_spec.rb',
    'src/orders/order_test.go',
    'test/orders.test.tsx',
  ])('recognises %s', (path) => {
    expect(isTestPath(path)).toBe(true)
  })

  it.each([
    'src/orders/order-service.ts',
    'src/latest/thing.ts',
    'src/contest/entry.ts',
    'README.md',
    'src/protest.ts',
  ])('leaves %s alone', (path) => {
    expect(isTestPath(path)).toBe(false)
  })

  it('does not care about the separator style', () => {
    expect(isTestPath('C:\\work\\app\\test\\a.ts')).toBe(true)
  })
})
