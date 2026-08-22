import { OrderRepository } from './order-repository.ts'
import { UnitOfWork } from './unit-of-work.ts'
import type { Order } from './types.ts'

export interface PaymentGateway {
  charge(cents: number): boolean
  refund(cents: number): boolean
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

  /**
   * Cancel a paid order and refund it.
   *
   * A refund is an outside effect. UnitOfWork.rollback() can drop a pending write, but it
   * cannot un-refund money, so the ordering here is a decision rather than a detail: the
   * same one place() makes when it charges before it commits. Refunding first and
   * committing second means this service owns one specific failure, and it is the one
   * where the refund lands but the commit throws, leaving the order reading 'paid'.
   *
   * The contract the tests hold this to:
   *   unknown id            -> throw
   *   status 'cancelled'    -> return it unchanged, do NOT touch the gateway
   *   any status but 'paid' -> throw, because a shipped order is a returns problem
   *   refund returns false  -> roll back and throw; the order stays 'paid'
   *   refund returns true   -> save as 'cancelled', commit, return it
   *
   * Every throw should name the order the way place() does, and the refund failure should
   * also say "refund". The tests match on the message, not merely on "something threw".
   */
  cancel(id: string): Order {
    const order = this.#orders.find(id)
    if (!order) throw new Error(`unknown order ${id}`)
    if (order.status === 'cancelled') return { ...order }
    if (order.status !== 'paid') {
      throw new Error(`cannot cancel order ${id} in status ${order.status}`)
    }

    const uow = new UnitOfWork()
    if (!this.#payments.refund(order.cents)) {
      uow.rollback()
      throw new Error(`refund failed for order ${id}`)
    }

    this.#orders.save({ ...order, status: 'cancelled' }, uow)
    uow.commit()
    return { ...order, status: 'cancelled' }
  }

  find(id: string): Order | undefined {
    return this.#orders.find(id)
  }
}
