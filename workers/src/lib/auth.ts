import { validateDeviceId } from './validate'

export interface AuthIdentity {
  type: 'device'
  deviceId: string
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Request에서 installId(= device_id) 추출.
 * X-Device-ID: <uuid> 헤더에서 읽음.
 */
export function extractIdentity(request: Request): AuthIdentity {
  const deviceId = validateDeviceId(request.headers.get('X-Device-ID'))
  return { type: 'device', deviceId }
}
