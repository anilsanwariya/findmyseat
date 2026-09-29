// Helpers for reading more rows than the API returns in one response.
//
// Supabase caps every response (1000 rows by default), so a plain select on a
// busy table silently drops rows. These page through with .range() until a
// short page comes back. Queries passed in should have a stable .order() so
// pages don't overlap or skip rows.

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export const PAGE_SIZE = 1000;

/** Fetch every row: `page(from, to)` must return the query with `.range(from, to)` applied. */
export async function fetchAllRows<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

/** Run `fn` over `items` in chunks, at most `concurrency` chunks at a time. */
export async function inChunks<I, R>(
  items: I[],
  chunkSize: number,
  concurrency: number,
  fn: (chunk: I[]) => Promise<R[]>,
): Promise<R[]> {
  const chunks: I[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize));
  const out: R[][] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      out[i] = await fn(chunks[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  return out.flat();
}
