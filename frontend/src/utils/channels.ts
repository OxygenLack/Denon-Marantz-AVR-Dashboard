/**
 * Channel codes in display order: the key order of `channelNames` (canonical
 * speaker order from /device), then any codes it does not know, in the order
 * the receiver reported them.
 */
export function orderChannels(
  channels: Record<string, unknown>,
  channelNames: Record<string, string>,
): string[] {
  const codes = Object.keys(channels)
  const known = Object.keys(channelNames).filter(code => code in channels)
  const unknown = codes.filter(code => !(code in channelNames))
  return [...known, ...unknown]
}
