/**
 * Visitor search text, made safe for a PostgREST filter: characters that end or group
 * filters ( , ( ) " \ ) and LIKE wildcards ( % _ * ) are turned into spaces.
 */
export function searchTerm(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[,()"\\%_*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
