const math = Math as typeof Math & { sumPrecise?: (values: Iterable<number>) => number }

if (typeof math.sumPrecise !== 'function') {
  math.sumPrecise = (values) => {
    let total = 0
    for (const n of values) total += n
    return total
  }
}
