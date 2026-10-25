import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingMessage, type OutgoingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

// Requests to servers listed in the catalog. Listings are community data, so a
// listed endpoint (or a redirect from it, or a DNS answer for it) could point
// into the network the API is deployed in. Every request here connects only to
// public addresses: IP literals are checked as written, host names are resolved
// here and refused if any address is private, and the connection goes to the
// address that was checked, so a second DNS answer can't swap it out.

export class BlockedDestination extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedDestination";
  }
}

export interface OutboundOptions {
  // Whether the request may connect to `address`. Defaults to public addresses only.
  allowAddress?: (address: string) => boolean;
  // When the whole request, redirects and body included, has to be done.
  deadline: number;
  maxRedirects?: number;
}

export interface OutboundRequest {
  method: "GET" | "POST" | "DELETE";
  headers?: OutgoingHttpHeaders;
  body?: string;
}

export interface OutboundResponse {
  status: number;
  headers: IncomingMessage["headers"];
  // Where the response came from, after redirects.
  url: URL;
  stream: IncomingMessage;
}

const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const blockedV4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including cloud metadata at 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, and broadcast
] as const) {
  blockedV4.addSubnet(network, prefix, "ipv4");
}

const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["::", 96], // IPv4-compatible (deprecated)
  ["100::", 64], // discard
  ["2001::", 23], // IETF protocol assignments, including Teredo, which hides an IPv4 address
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) {
  blockedV6.addSubnet(network, prefix, "ipv6");
}

// Whether `address` is on the public internet. IPv6 forms that carry an IPv4
// address (mapped, NAT64, 6to4) are judged by that IPv4 address.
export const isPublicAddress = (address: string): boolean => {
  const version = isIP(address);

  if (version === 4) {
    return !blockedV4.check(address, "ipv4");
  }

  if (version !== 6) {
    return false;
  }

  const groups = ipv6Groups(address);

  if (!groups) {
    return false;
  }

  const embedded = embeddedIpv4(groups);

  if (embedded) {
    return isPublicAddress(embedded);
  }

  return !blockedV6.check(address, "ipv6");
};

// Sends `init` to `url` and returns the response once its headers arrive. The
// caller reads (or destroys) `stream`; it is destroyed when the deadline passes.
export const outboundRequest = async (
  url: URL,
  init: OutboundRequest,
  options: OutboundOptions
): Promise<OutboundResponse> => {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let current = url;

  for (let redirects = 0; ; redirects += 1) {
    const response = await requestOnce(current, init, options);

    if (!REDIRECTS.has(response.status)) {
      return response;
    }

    response.stream.destroy();
    const location = response.headers.location;

    // A POST only follows redirects that keep it a POST with the same body.
    if (!location || (init.method !== "GET" && response.status !== 307 && response.status !== 308)) {
      return response;
    }

    if (redirects >= maxRedirects) {
      throw new BlockedDestination(`More than ${maxRedirects} redirects`);
    }

    current = new URL(location, current);
  }
};

const requestOnce = (url: URL, init: OutboundRequest, options: OutboundOptions): Promise<OutboundResponse> => {
  const allowAddress = options.allowAddress ?? isPublicAddress;

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return Promise.reject(new BlockedDestination(`Refused ${url.protocol} URL`));
  }

  if (url.username || url.password) {
    return Promise.reject(new BlockedDestination("Refused URL with credentials"));
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");

  // DNS isn't asked about an IP literal, so it is checked as written.
  if (isIP(host) && !allowAddress(host)) {
    return Promise.reject(new BlockedDestination(`Refused ${host}: not a public address`));
  }

  const remaining = options.deadline - Date.now();

  if (remaining <= 0) {
    return Promise.reject(timedOut());
  }

  return new Promise((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(url, {
      method: init.method,
      headers: {
        "User-Agent": "tensorblock-mcp-index-health/1.0",
        ...init.headers,
        ...(init.body === undefined ? {} : { "Content-Length": Buffer.byteLength(init.body) }),
      },
      // A fresh connection per request, so nothing pooled outlives its checks.
      agent: false,
      lookup: guardedLookup(allowAddress),
    });

    // Until the headers arrive the deadline ends the request; after, it ends the body.
    let timer = setTimeout(() => request.destroy(timedOut()), remaining);
    timer.unref();

    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.on("response", (stream) => {
      clearTimeout(timer);
      timer = setTimeout(() => stream.destroy(timedOut()), Math.max(options.deadline - Date.now(), 0));
      timer.unref();
      stream.on("close", () => clearTimeout(timer));
      resolve({ status: stream.statusCode ?? 0, headers: stream.headers, url, stream });
    });
    request.end(init.body);
  });
};

// Resolves a host name and refuses it when any of its addresses isn't allowed,
// so a host can't pass with one public record and connect through a private one.
const guardedLookup = (allowAddress: (address: string) => boolean) =>
  (
    hostname: string,
    options: { all?: boolean; family?: number | string },
    callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void
  ): void => {
    dnsLookup(hostname, { all: true, family: options.family as 0 | 4 | 6 | undefined }, (error, addresses) => {
      if (error) {
        callback(error, []);
        return;
      }

      const refused = addresses.find(({ address }) => !allowAddress(address));

      if (refused || addresses.length === 0) {
        callback(new BlockedDestination(`Refused ${hostname}: resolves to ${refused?.address ?? "nothing"}, not a public address`), []);
        return;
      }

      if (options.all) {
        callback(null, addresses);
        return;
      }

      callback(null, addresses[0].address, addresses[0].family);
    });
  };

const timedOut = (): Error => Object.assign(new Error("Timed out"), { name: "AbortError" });

// The eight 16-bit groups of an IPv6 address, or null when it doesn't parse.
const ipv6Groups = (address: string): number[] | null => {
  let text = address.toLowerCase().split("%")[0];
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);

  if (dotted) {
    const octets = dotted[1].split(".").map(Number);
    const tail = `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    text = text.slice(0, -dotted[1].length) + tail;
  }

  const [head, rest] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = rest === undefined ? [] : rest ? rest.split(":") : [];
  const missing = 8 - left.length - right.length;

  if ((rest === undefined && missing !== 0) || missing < 0) {
    return null;
  }

  const groups = [...left, ...Array(rest === undefined ? 0 : missing).fill("0"), ...right].map((group) => parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => group >= 0 && group <= 0xffff) ? groups : null;
};

// The IPv4 address inside an IPv4-mapped (::ffff:a.b.c.d), NAT64 (64:ff9b::/96)
// or 6to4 (2002::/16) address.
const embeddedIpv4 = (groups: number[]): string | null => {
  const ipv4 = (high: number, low: number) => [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");

  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return ipv4(groups[6], groups[7]);
  }

  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) {
    return ipv4(groups[6], groups[7]);
  }

  if (groups[0] === 0x2002) {
    return ipv4(groups[1], groups[2]);
  }

  return null;
};
