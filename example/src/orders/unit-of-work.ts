/**
 * Owns the transaction boundary.
 *
 * Deliberately the only thing here that can commit or roll back. The repository below
 * knows nothing about transactions, which is the kind of arrangement worth having an
 * opinion about before you read the code that uses it.
 */
export class UnitOfWork {
  #pending: (() => void)[] = []
  #committed = false

  enlist(change: () => void): void {
    if (this.#committed) throw new Error('this unit of work has already been committed')
    this.#pending.push(change)
  }

  commit(): void {
    for (const change of this.#pending) change()
    this.#pending = []
    this.#committed = true
  }

  rollback(): void {
    this.#pending = []
  }

  get pendingCount(): number {
    return this.#pending.length
  }
}
