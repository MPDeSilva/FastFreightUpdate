export function pickWinner<T extends { updated_at: string }>(
  local: T | null,
  incoming: T,
  tiebreakerLocal: string,
  tiebreakerIncoming: string
): T {
  if (!local) return incoming;
  if (incoming.updated_at > local.updated_at) return incoming;
  if (incoming.updated_at < local.updated_at) return local;
  return tiebreakerIncoming > tiebreakerLocal ? incoming : local;
}
