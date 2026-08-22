import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OrderRepository } from '../src/orders/order-repository.ts'
import { OrderService } from '../src/orders/order-service.ts'

const alwaysPays = { charge: () => true }
const neverPays = { charge: () => false }

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
