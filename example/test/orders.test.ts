import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OrderRepository } from '../src/orders/order-repository.ts'
import { OrderService } from '../src/orders/order-service.ts'
import { UnitOfWork } from '../src/orders/unit-of-work.ts'

const alwaysPays = { charge: () => true, refund: () => true }
const neverPays = { charge: () => false, refund: () => false }
const refundFails = { charge: () => true, refund: () => false }

// Counts how often the gateway was actually reached, which is the whole point of the
// no-op: a second cancel must not touch it.
function countingGateway() {
  let refunds = 0
  return {
    charge: () => true,
    refund: () => {
      refunds++
      return true
    },
    get refunds() {
      return refunds
    },
  }
}

test('a paid order is stored', () => {
  const repo = new OrderRepository()
  new OrderService(repo, alwaysPays).place('a1', 'lander', 2500)
  assert.equal(repo.find('a1')?.status, 'paid')
})

test('a declined payment leaves nothing behind', () => {
  const repo = new OrderRepository()
  const service = new OrderService(repo, neverPays)
  assert.throws(() => service.place('a2', 'lander', 2500), /declined/)
  assert.equal(repo.find('a2'), undefined)
})

test('the repository never writes on its own', () => {
  const repo = new OrderRepository()
  new OrderService(repo, alwaysPays).place('a3', 'lander', 100)
  assert.equal(repo.all().length, 1)
})

test('cancelling a paid order refunds it and marks it cancelled', () => {
  const repo = new OrderRepository()
  const service = new OrderService(repo, alwaysPays)
  service.place('c1', 'lander', 2500)

  const cancelled = service.cancel('c1')

  assert.equal(cancelled.status, 'cancelled')
  assert.equal(repo.find('c1')?.status, 'cancelled')
})

test('a failed refund leaves the order paid', () => {
  const repo = new OrderRepository()
  const service = new OrderService(repo, refundFails)
  service.place('c2', 'lander', 2500)

  assert.throws(() => service.cancel('c2'), /refund/)
  assert.equal(repo.find('c2')?.status, 'paid')
})

test('cancelling twice refunds once', () => {
  const repo = new OrderRepository()
  const payments = countingGateway()
  const service = new OrderService(repo, payments)
  service.place('c3', 'lander', 2500)

  service.cancel('c3')
  const again = service.cancel('c3')

  assert.equal(again.status, 'cancelled')
  assert.equal(payments.refunds, 1)
})

test('a shipped order cannot be cancelled', () => {
  const repo = new OrderRepository()
  const payments = countingGateway()
  const uow = new UnitOfWork()
  repo.save({ id: 'c4', customer: 'lander', cents: 100, status: 'shipped' }, uow)
  uow.commit()

  assert.throws(() => new OrderService(repo, payments).cancel('c4'), /shipped/)
  assert.equal(payments.refunds, 0)
  assert.equal(repo.find('c4')?.status, 'shipped')
})

test('a placed order cannot be cancelled', () => {
  const repo = new OrderRepository()
  const payments = countingGateway()
  const uow = new UnitOfWork()
  repo.save({ id: 'c5', customer: 'lander', cents: 100, status: 'placed' }, uow)
  uow.commit()

  assert.throws(() => new OrderService(repo, payments).cancel('c5'), /placed/)
  assert.equal(payments.refunds, 0)
  assert.equal(repo.find('c5')?.status, 'placed')
})

test('a no-op cancel does not hand back repository state', () => {
  const repo = new OrderRepository()
  const service = new OrderService(repo, alwaysPays)
  service.place('c6', 'lander', 2500)
  service.cancel('c6')

  const again = service.cancel('c6')
  again.customer = 'someone else'

  assert.equal(repo.find('c6')?.customer, 'lander')
})

test('an unknown order cannot be cancelled', () => {
  const repo = new OrderRepository()
  assert.throws(() => new OrderService(repo, alwaysPays).cancel('nope'), /nope/)
})
