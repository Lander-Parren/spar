import { OrderRepository } from './order-repository.ts'
import { UnitOfWork } from './unit-of-work.ts'
import type { Order } from './types.ts'

export interface PaymentGateway {
  charge(cents: number): boolean
}

export class OrderService {
  readonly #orders: OrderRepository
  readonly #payments: PaymentGateway

  // Written out rather than as constructor parameter properties: Node strips types
  // without a compiler, and a parameter property emits real code, so it is not
  // something type stripping can do.
  constructor(orders: OrderRepository, payments: PaymentGateway) {
    this.#orders = orders
    this.#payments = payments
  }

  /**
   * Place an order and take payment as one unit: if the charge fails, nothing lands.
   * The service opens the transaction, not the repository.
   */
  place(id: string, customer: string, cents: number): Order {
    const uow = new UnitOfWork()
    const order: Order = { id, customer, cents, status: 'placed' }
    this.#orders.save(order, uow)

    if (!this.#payments.charge(cents)) {
      uow.rollback()
      throw new Error(`payment declined for order ${id}`)
    }

    this.#orders.save({ ...order, status: 'paid' }, uow)
    uow.commit()
    return { ...order, status: 'paid' }
  }

  find(id: string): Order | undefined {
    return this.#orders.find(id)
  }
}
