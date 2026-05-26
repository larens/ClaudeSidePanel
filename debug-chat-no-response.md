[OPEN] Debug Session: chat-no-response

## Symptom
- Side panel chat sends message but assistant returns no content.

## Expected
- After sending a message, the assistant streams text/thinking and completes.

## Hypotheses
- A: Bridge WebSocket is not actually connected (connect fails, reconnect loops, wrong port).
- B: Bridge receives request but never emits chunk/complete back (bridge-side error, auth/token mismatch).
- C: Request is sent, but sidepanel handler does not append text (payload shape mismatch, parsing/dispatch issue).
- D: Request is never sent due to UI state (disabled/isStreaming stuck) or sessionId creation fails.
- E: Runtime errors in sidepanel/background prevent message flow (uncaught exception stops listeners).

## Evidence Plan
- Instrument sidepanel send path (ChatInput.doSend) and BridgeClient lifecycle (connect/open/close/error/sendStream/onmessage).
- Collect NDJSON logs via Debug Server and map evidence to hypotheses A–E.

## Evidence (Post-fix)
- Bridge can handle unauthenticated chat end-to-end (chunk + complete).
- NDJSON: `.dbg/trae-debug-log-chat-no-response.ndjson` shows `session.ts:sendChunk` and `session.ts:sendComplete`.

## Fix
- Bridge auto-authenticates local WebSocket connections so the extension can send chat/session requests without needing a token.
