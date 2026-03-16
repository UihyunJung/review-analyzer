const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateDeviceId(deviceId: string | null): string {
  if (!deviceId) throw new Error('X-Device-ID header required')
  if (!UUID_REGEX.test(deviceId)) throw new Error('Invalid device_id format')
  return deviceId
}

export function validateRequestSize(contentLength: string | null, maxBytes: number): void {
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new SizeError(`Request too large (max ${maxBytes} bytes)`)
  }
}

export class SizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SizeError'
  }
}

export class UsageExceededError extends Error {
  constructor() {
    super('Daily analysis limit reached')
    this.name = 'UsageExceededError'
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}
