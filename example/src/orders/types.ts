export type OrderStatus = 'placed' | 'paid' | 'shipped' | 'cancelled'

export interface Order {
  id: string
  customer: string
  cents: number
  status: OrderStatus
}
