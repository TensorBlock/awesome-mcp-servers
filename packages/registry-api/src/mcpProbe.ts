import type { AuthType } from "../../catalog-builder/src/types.js";
import { BlockedDestination, outboundRequest, type OutboundResponse } from "./outbound.js";

// Checks that a hosted server speaks MCP: it has to answer an `initialize`
// request with a JSON-RPC result carrying a protocol version and capabilities,
// over Streamable HTTP or, for older servers, the HTTP+SSE handshake. A page
// that merely mentions "protocolVersion", or a JSON-RPC error, doesn't pass.

export interface ProbeResult {
  status: "ok" | "auth-required" | "failing";
  auth: AuthType | null;
  detail: string | null;
}

export interface ProbeOptions {
  deadline: number;
  allowAddress?: (address: string) => boolean;
  // The listing says the server uses the older HTTP+SSE transport.
  legacySse?: boolean;
}

const PROTOCOL_VERSION = "2025-06-18";
const MAX_BODY_BYTES = 64 * 1024;

const initializeRequest = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "tensorblock-mcp-index-health", version: "1.0" },
  },
});

const initializedNotification = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });

export const probeMcpEndpoint = async (url: string, options: ProbeOptions): Promise<ProbeResult> => {
  try {
    const response = await outboundRequest(new URL(url), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: initializeRequest,
    }, options);

    // Servers on the older HTTP+SSE transport take no POST at the stream URL.
    if (options.legacySse && (response.status === 404 || response.status === 405)) {
      response.stream.destroy();
      return await probeLegacySse(new URL(url), options);
    }

    return await streamableResult(response, options);
  } catch (error) {
    return failing(errorDetail(error));
  }
};

// The answer to an initialize POST on the Streamable HTTP transport.
const streamableResult = async (response: OutboundResponse, options: ProbeOptions): Promise<ProbeResult> => {
  const challenge = await authChallenge(response);

  if (challenge) {
    return challenge;
  }

  if (response.status !== 200) {
    response.stream.destroy();
    return failing(`HTTP ${response.status}`);
  }

  const type = contentType(response);
  let message: unknown;

  if (type === "application/json") {
    message = parseJson(await readBody(response));
  } else if (type === "text/event-stream") {
    message = await readSseMessage(response, (event) => event.event === "message" && isResponseTo(parseJson(event.data), 1));
  } else {
    response.stream.destroy();
    return failing(`Not an MCP response (${type || "no content type"})`);
  }

  const invalid = initializeError(message);

  if (invalid) {
    return failing(invalid);
  }

  // Finish the handshake and end the session, as a client would.
  const session = header(response, "mcp-session-id");
  const headers = {
    "MCP-Protocol-Version": PROTOCOL_VERSION,
    ...(session ? { "Mcp-Session-Id": session } : {}),
  };
  await bestEffort(response.url, { method: "POST", headers: { ...headers, "Content-Type": "application/json", "Accept": "application/json, text/event-stream" }, body: initializedNotification }, options);

  if (session) {
    await bestEffort(response.url, { method: "DELETE", headers }, options);
  }

  return { status: "ok", auth: "none", detail: null };
};

// The older HTTP+SSE handshake: open the event stream, wait for the endpoint
// the server names, POST initialize there, and read the result off the stream.
const probeLegacySse = async (url: URL, options: ProbeOptions): Promise<ProbeResult> => {
  const response = await outboundRequest(url, { method: "GET", headers: { Accept: "text/event-stream" } }, options);
  const challenge = await authChallenge(response);

  if (challenge) {
    return challenge;
  }

  if (response.status !== 200 || contentType(response) !== "text/event-stream") {
    response.stream.destroy();
    return failing(`HTTP ${response.status} ${contentType(response) || ""}`.trim());
  }

  const events = sseEvents(response);

  try {
    const endpointEvent = await nextEvent(events, (event) => event.event === "endpoint");

    if (!endpointEvent) {
      return failing("The event stream named no endpoint");
    }

    const endpoint = new URL(endpointEvent.data.trim(), response.url);

    // The endpoint has to be on the server that sent it, not somewhere it points us.
    if (endpoint.origin !== response.url.origin) {
      return failing(`The event stream named an endpoint on another origin (${endpoint.origin})`);
    }

    const posted = await outboundRequest(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: initializeRequest,
    }, options);
    posted.stream.destroy();

    if (posted.status < 200 || posted.status >= 300) {
      return failing(`HTTP ${posted.status} from the message endpoint`);
    }

    const result = await nextEvent(events, (event) => event.event === "message" && isResponseTo(parseJson(event.data), 1));
    const invalid = initializeError(result ? parseJson(result.data) : undefined);

    if (invalid) {
      return failing(invalid);
    }

    await bestEffort(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: initializedNotification }, options);
    return { status: "ok", auth: "none", detail: null };
  } finally {
    response.stream.destroy();
  }
};

// A sign-in challenge proves the server is up even without credentials: a
// 401/403 with a WWW-Authenticate challenge or a JSON error, or a 401 with any
// other body except a web page ("Unauthorized: missing x-api-key"). A login
// page, or a 403 from a bot wall, doesn't pass for a protected MCP server.
const authChallenge = async (response: OutboundResponse): Promise<ProbeResult | null> => {
  if (response.status !== 401 && response.status !== 403) {
    return null;
  }

  const challenge = header(response, "www-authenticate");
  const type = contentType(response);
  const plainRefusal = response.status === 401 && type !== "text/html" && type !== "application/xhtml+xml";
  response.stream.destroy();

  if (!challenge && type !== "application/json" && !plainRefusal) {
    return failing(`HTTP ${response.status} without an auth challenge`);
  }

  return {
    status: "auth-required",
    auth: /resource_metadata|realm="oauth"/i.test(challenge) ? "oauth" : "bearer",
    detail: `HTTP ${response.status}`,
  };
};

// Why `message` isn't a successful initialize response, or null when it is.
const initializeError = (message: unknown): string | null => {
  if (!message || typeof message !== "object") {
    return "No JSON-RPC response to initialize";
  }

  const response = message as { jsonrpc?: unknown; id?: unknown; result?: unknown; error?: unknown };

  if (response.jsonrpc !== "2.0" || response.id !== 1) {
    return "No JSON-RPC response to initialize";
  }

  if (response.error !== undefined) {
    const error = response.error as { code?: unknown; message?: unknown };
    return `initialize failed: ${typeof error?.message === "string" ? error.message.slice(0, 200) : "JSON-RPC error"}${typeof error?.code === "number" ? ` (${error.code})` : ""}`;
  }

  const result = response.result as { protocolVersion?: unknown; capabilities?: unknown } | undefined;

  if (!result || typeof result !== "object" || typeof result.protocolVersion !== "string" || !result.protocolVersion) {
    return "initialize result has no protocolVersion";
  }

  if (!result.capabilities || typeof result.capabilities !== "object" || Array.isArray(result.capabilities)) {
    return "initialize result has no capabilities";
  }

  return null;
};

const isResponseTo = (message: unknown, id: number): boolean =>
  Boolean(message) && typeof message === "object" && (message as { id?: unknown }).id === id;

interface SseEvent {
  event: string;
  data: string;
}

// Events of a text/event-stream body, at most MAX_BODY_BYTES of it.
async function* sseEvents(response: OutboundResponse): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let read = 0;

  for await (const chunk of response.stream) {
    read += chunk.length;

    if (read > MAX_BODY_BYTES) {
      throw new Error("Event stream too large");
    }

    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n?/g, "\n");

    for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = "message";
      const data: string[] = [];

      for (const line of block.split("\n")) {
        if (line.startsWith(":")) {
          continue;
        }

        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");

        if (field === "event") {
          event = value;
        } else if (field === "data") {
          data.push(value);
        }
      }

      if (data.length > 0) {
        yield { event, data: data.join("\n") };
      }
    }
  }
}

const nextEvent = async (events: AsyncGenerator<SseEvent>, wanted: (event: SseEvent) => boolean): Promise<SseEvent | null> => {
  for (let next = await events.next(); !next.done; next = await events.next()) {
    if (wanted(next.value)) {
      return next.value;
    }
  }

  return null;
};

const readSseMessage = async (response: OutboundResponse, wanted: (event: SseEvent) => boolean): Promise<unknown> => {
  const events = sseEvents(response);

  try {
    const event = await nextEvent(events, wanted);
    return event ? parseJson(event.data) : undefined;
  } finally {
    response.stream.destroy();
  }
};

const readBody = async (response: OutboundResponse): Promise<string> => {
  const chunks: Buffer[] = [];
  let read = 0;

  for await (const chunk of response.stream) {
    read += chunk.length;

    if (read > MAX_BODY_BYTES) {
      response.stream.destroy();
      throw new Error("Response too large");
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
};

// Sends a follow-up the check doesn't depend on, such as notifications/initialized.
const bestEffort = async (url: URL, init: Parameters<typeof outboundRequest>[1], options: ProbeOptions): Promise<void> => {
  try {
    const response = await outboundRequest(url, init, { ...options, maxRedirects: 0 });
    response.stream.destroy();
  } catch {
    // The server already answered initialize; a failed follow-up doesn't change that.
  }
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const contentType = (response: OutboundResponse): string =>
  (header(response, "content-type").split(";")[0] ?? "").trim().toLowerCase();

const header = (response: OutboundResponse, name: string): string => {
  const value = response.headers[name];
  return Array.isArray(value) ? value.join(", ") : value ?? "";
};

const failing = (detail: string): ProbeResult => ({ status: "failing", auth: null, detail });

const errorDetail = (error: unknown): string => {
  if (error instanceof BlockedDestination) {
    return error.message;
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "Timed out";
    }

    const cause = (error as { cause?: unknown }).cause;

    if (cause instanceof Error && cause.message) {
      return cause.message;
    }

    // A connection tried on several addresses fails with an AggregateError
    // whose message is empty; its code or first error says why.
    if (!error.message) {
      const code = (error as NodeJS.ErrnoException).code;
      const first = error instanceof AggregateError ? error.errors.find((e) => e instanceof Error && e.message) : undefined;
      return code ?? (first instanceof Error ? first.message : "Connection failed");
    }

    return error.message;
  }

  return "Unknown error";
};
