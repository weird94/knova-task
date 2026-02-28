export class LruMap<TKey, TValue> {
  private readonly map = new Map<TKey, TValue>();

  constructor(private readonly capacity: number) {
    if (capacity <= 0) {
      throw new Error("LRU capacity must be greater than 0.");
    }
  }

  get size(): number {
    return this.map.size;
  }

  get(key: TKey): TValue | undefined {
    const value = this.map.get(key);

    if (value === undefined) {
      return undefined;
    }

    this.map.delete(key);
    this.map.set(key, value);

    return value;
  }

  set(key: TKey, value: TValue): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }

    this.map.set(key, value);

    if (this.map.size > this.capacity) {
      const firstKey = this.map.keys().next().value as TKey;
      this.map.delete(firstKey);
    }
  }

  clear(): void {
    this.map.clear();
  }
}
