// PRD 27: native UUIDs, no dependency. Available in all supported browsers
// and Node >= 19 (our runtime is 22).
export function newId(): string {
  return crypto.randomUUID();
}
