import type { Order } from './types.ts'
import type { UnitOfWork } from './unit-of-work.ts'

/**
 * In-memory storage. Transaction-unaware on purpose: a write is queued on the unit of
 * work and only lands when that commits.
 */
export class OrderRepository {
  #rows = new Map<string, Order>()

  find(id: string): Order | undefined {
    return this.#rows.get(id)
  }

  all(): Order[] {
    return [...this.#rows.values()]
  }

  save(order: Order, uow: UnitOfWork): void {
    uow.enlist(() => this.#rows.set(order.id, { ...order }))
  }
}
