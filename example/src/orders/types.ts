export type OrderStatus = 'placed' | 'paid' | 'shipped'

export interface Order {
  id: string
  customer: string
  cents: number
  status: OrderStatus
}
