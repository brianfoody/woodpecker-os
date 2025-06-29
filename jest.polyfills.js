/**
 * @note The block below contains polyfills for Node.js globals
 * required for Jest to function when running JSDOM tests.
 * These HAVE to be require's and NOT import's
 * Node.js globals that are used in tests.
 */

const { TextDecoder, TextEncoder } = require('util')

Object.defineProperties(globalThis, {
  TextDecoder: { value: TextDecoder },
  TextEncoder: { value: TextEncoder },
})

const { Blob, File } = require('buffer')
const { fetch, Headers, FormData, Request, Response } = require('undici')

Object.defineProperties(globalThis, {
  fetch: { value: fetch, writable: true },
  Blob: { value: Blob },
  File: { value: File },
  Headers: { value: Headers },
  FormData: { value: FormData },
  Request: { value: Request },
  Response: { value: Response },
})

// Mock BroadcastChannel for Jest environment
class MockBroadcastChannel {
  constructor(name) {
    this.name = name
    this.onmessage = null
    this.onmessageerror = null
  }

  postMessage(message) {
    // Mock implementation - does nothing in test environment
  }

  close() {
    // Mock implementation - does nothing in test environment
  }

  addEventListener(type, listener) {
    // Mock implementation - does nothing in test environment
  }

  removeEventListener(type, listener) {
    // Mock implementation - does nothing in test environment
  }

  dispatchEvent(event) {
    // Mock implementation - does nothing in test environment
    return true
  }
}

Object.defineProperty(globalThis, 'BroadcastChannel', {
  value: MockBroadcastChannel,
  writable: true
})