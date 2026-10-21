// The client IP the auth rate limits key on (#22): the trusted proxy's header when one is configured
// (CLIENT_IP_HEADER), else the connection's own address. Only a valid IP is used, so a malformed header can never put
// every client in one shared bucket.
import { isIP } from 'node:net'

/**
 * `header`: the trusted proxy header's value, if configured and sent; with a list, the last entry is the one that
 * proxy added. `socket`: the connection's address. A port is stripped; anything that is not an IP falls through.
 */
export function resolveClientIp(header: string | undefined, socket: string | undefined): string | undefined {
  const fromHeader = header === undefined ? undefined : asIp(header.split(',').at(-1)?.trim() ?? '')
  return fromHeader ?? (socket === undefined ? undefined : asIp(socket))
}

function asIp(value: string): string | undefined {
  if (isIP(value)) return value
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value)
  if (bracketed && isIP(bracketed[1])) return bracketed[1]
  const withPort = /^([^:]+):\d+$/.exec(value)
  if (withPort && isIP(withPort[1])) return withPort[1]
  return undefined
}
