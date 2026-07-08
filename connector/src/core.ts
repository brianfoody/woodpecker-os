/**
 * Transport-agnostic handling of app-layer messages from the canvas.
 * Both the relay transport and the local WS server dispatch here.
 */

import { hostname } from "node:os";
import type { AppMessage } from "@woodpeckeros/protocol";
import { PROTOCOL_VERSION } from "@woodpeckeros/protocol";
import { runClaudeCode } from "./agent";
import { extractTextFromImage } from "./ocr";
import { listSessionSummaries, getTranscript } from "./session";
import {
  recordDevice,
  saveCanvasSnapshot,
  loadCanvasSnapshot,
} from "./storage";

export type Send = (msg: AppMessage) => void;

export type ConnectorCore = {
  /** Fire-and-forget: never blocks the message pump (cancel must be able to
   *  arrive while an execute is streaming). */
  handle: (msg: AppMessage, send: Send) => void;
};

export function createCore(opts: {
  cwd: string;
  yolo: boolean;
  version: string;
}): ConnectorCore {
  const activeRuns = new Map<string, AbortController>();

  async function handleAsync(msg: AppMessage, send: Send): Promise<void> {
    switch (msg.kind) {
      case "hello": {
        recordDevice(msg.deviceId, msg.deviceName);
        console.log(
          `[connector] device connected: ${msg.deviceName || msg.deviceId}`
        );
        send({
          kind: "hello-ack",
          connectorVersion: opts.version,
          cwd: opts.cwd,
          hostname: hostname(),
          protocolVersion: PROTOCOL_VERSION,
        });
        break;
      }

      case "execute": {
        const ac = new AbortController();
        activeRuns.set(msg.reqId, ac);
        console.log(
          `[connector] execute ${msg.reqId} (resume=${msg.resumeSessionId || "none"})`
        );
        try {
          for await (const event of runClaudeCode({
            prompt: msg.prompt,
            image: msg.image,
            resumeSessionId: msg.resumeSessionId,
            cwd: opts.cwd,
            yolo: opts.yolo,
            signal: ac.signal,
          })) {
            send({ kind: "event", reqId: msg.reqId, event });
          }
        } catch (error) {
          send({
            kind: "event",
            reqId: msg.reqId,
            event: {
              type: "error",
              content: error instanceof Error ? error.message : "Unknown error",
            },
          });
        } finally {
          activeRuns.delete(msg.reqId);
        }
        break;
      }

      case "cancel": {
        console.log(`[connector] cancel ${msg.reqId}`);
        activeRuns.get(msg.reqId)?.abort();
        break;
      }

      case "extract-text": {
        try {
          const text = await extractTextFromImage(msg.image, opts.cwd);
          send({ kind: "extract-text-result", reqId: msg.reqId, text });
        } catch (error) {
          send({
            kind: "error",
            reqId: msg.reqId,
            message: error instanceof Error ? error.message : "OCR failed",
          });
        }
        break;
      }

      case "canvas-save": {
        saveCanvasSnapshot(msg.canvasKey, msg.rev, msg.snapshot);
        break;
      }

      case "canvas-load": {
        const stored = loadCanvasSnapshot(msg.canvasKey);
        send({
          kind: "canvas-snapshot",
          canvasKey: msg.canvasKey,
          rev: stored?.rev ?? 0,
          snapshot: stored?.snapshot ?? null,
        });
        break;
      }

      case "sessions-list": {
        const sessions = await listSessionSummaries(opts.cwd);
        send({ kind: "sessions-list-result", reqId: msg.reqId, sessions });
        break;
      }

      case "transcript": {
        const result = await getTranscript(msg.sessionId);
        send({
          kind: "transcript-result",
          reqId: msg.reqId,
          textBlocks: result.textBlocks,
          isComplete: result.isComplete,
        });
        break;
      }

      default:
        // Messages the connector only sends (event, hello-ack, ...) or
        // future kinds from a newer canvas — ignore.
        break;
    }
  }

  return {
    handle(msg, send) {
      void handleAsync(msg, send).catch((error) => {
        console.error(`[connector] handler error for ${msg.kind}:`, error);
      });
    },
  };
}
