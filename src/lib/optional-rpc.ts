// Call a database function that may not have been deployed yet.
//
// Used for functions proposed in supabase/proposed/*.sql: until they are
// applied, PostgREST answers PGRST202 ("function not found") and callers fall
// back to their previous behaviour, so code and database can ship in any order.

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

export async function callOptionalRpc<T>(
  client: unknown,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ missing: true } | { missing: false; data: T }> {
  const { data, error } = await (client as RpcClient).rpc(fn, args);
  if (error?.code === "PGRST202") return { missing: true };
  if (error) throw new Error(error.message);
  return { missing: false, data: data as T };
}
