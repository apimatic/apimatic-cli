/** What a key must spell itself as: two values that spell the same are one key. */
type Spelled = { toString(): string };

/** A map keyed by a value object rather than by reference, so a path read twice from git finds the same entry. */
export class ValueMap<K extends Spelled, V> {
  private readonly entries = new Map<string, { key: K; value: V }>();

  constructor(pairs: Iterable<readonly [K, V]> = []) {
    for (const [key, value] of pairs) {
      this.set(key, value);
    }
  }

  public set(key: K, value: V): this {
    this.entries.set(key.toString(), { key, value });
    return this;
  }

  public get(key: K): V | undefined {
    return this.entries.get(key.toString())?.value;
  }

  public has(key: K): boolean {
    return this.entries.has(key.toString());
  }

  public delete(key: K): boolean {
    return this.entries.delete(key.toString());
  }

  public values(): V[] {
    return [...this.entries.values()].map((entry) => entry.value);
  }

  public *[Symbol.iterator](): IterableIterator<[K, V]> {
    for (const { key, value } of this.entries.values()) {
      yield [key, value];
    }
  }
}

/** A set of value objects, by what they spell. */
export class ValueSet<K extends Spelled> {
  private readonly members = new ValueMap<K, K>();

  constructor(keys: Iterable<K> = []) {
    for (const key of keys) {
      this.add(key);
    }
  }

  public add(key: K): this {
    this.members.set(key, key);
    return this;
  }

  public has(key: K): boolean {
    return this.members.has(key);
  }

  public delete(key: K): boolean {
    return this.members.delete(key);
  }

  public values(): K[] {
    return this.members.values();
  }
}
