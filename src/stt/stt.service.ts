import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createDecipheriv, type DecipherGCM } from 'crypto'
import { isIP } from 'net'
import { lookup } from 'dns/promises'
import type { SttProvider, SttProviderConfig, TranscriptionResult } from './providers/stt-provider.interface'
import { createSttProvider } from './providers/stt-provider.factory'

export interface AudioCiphering {
  algorithm: string
  parameters?: Record<string, unknown>
}

const AUDIO_MIME_PREFIXES = ['audio/']

/** OpenAI Whisper rejects files larger than 25 MB; cap the download well before that. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024
/** Hard ceiling on the media download so a slow/hung origin can't stall the bot. */
const DOWNLOAD_TIMEOUT_MS = 30_000

/**
 * Ciphers we are willing to use for inbound media decryption. The algorithm
 * arrives in the (attacker-influenced) message, so it must be allowlisted —
 * never passed straight into createDecipheriv.
 */
const ALLOWED_CIPHERS: Record<string, { keyBytes: number; ivBytes: number; aead: boolean }> = {
  'aes-128-cbc': { keyBytes: 16, ivBytes: 16, aead: false },
  'aes-256-cbc': { keyBytes: 32, ivBytes: 16, aead: false },
  'aes-128-gcm': { keyBytes: 16, ivBytes: 12, aead: true },
  'aes-256-gcm': { keyBytes: 32, ivBytes: 12, aead: true },
}
const GCM_AUTH_TAG_BYTES = 16

@Injectable()
export class SttService implements OnModuleInit {
  private readonly logger = new Logger(SttService.name)
  private provider: SttProvider | null = null
  private requireAuth = false

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const providerConfig = this.config.get<SttProviderConfig>('appConfig.sttProvider')
    this.requireAuth = this.config.get<boolean>('appConfig.sttRequireAuth') ?? false

    if (!providerConfig) {
      this.logger.log('No speech-to-text provider configured. Voice notes will not be transcribed.')
      return
    }

    try {
      this.provider = createSttProvider(providerConfig)
      this.logger.log(
        `STT provider "${providerConfig.name}" (${providerConfig.type}) initialized. ` +
          `requireAuth=${this.requireAuth}`,
      )
    } catch (err) {
      this.logger.error(`Failed to initialize STT provider "${providerConfig.name}": ${err}`)
    }
  }

  get isEnabled(): boolean {
    return this.provider !== null
  }

  /**
   * Returns true if the given MIME type is an audio format that can be transcribed.
   */
  isAudioMimeType(mimeType: string): boolean {
    return AUDIO_MIME_PREFIXES.some((prefix) => mimeType.toLowerCase().startsWith(prefix))
  }

  /**
   * Check whether transcription is allowed for the given session.
   * Returns false if requireAuth is true and the user is not authenticated.
   */
  isAllowed(isAuthenticated: boolean): boolean {
    if (!this.isEnabled) return false
    if (this.requireAuth && !isAuthenticated) return false
    return true
  }

  /**
   * Download audio from a URL and transcribe it.
   *
   * The URL originates from an inbound message, so the fetch is guarded
   * against SSRF: only http(s), no private/loopback/link-local targets, no
   * redirects, a hard timeout, and a size cap.
   */
  async transcribeFromUrl(url: string, mimeType: string, ciphering?: AudioCiphering): Promise<TranscriptionResult> {
    if (!this.provider) {
      throw new Error('STT provider is not configured.')
    }

    await this.assertSafeUrl(url)

    this.logger.log(`Downloading audio for transcription (${mimeType})...`)

    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`Failed to download audio: HTTP ${response.status}`)
    }

    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES) {
      throw new Error(`Audio exceeds the ${MAX_AUDIO_BYTES} byte limit (declared ${declaredLength}).`)
    }

    let buffer = await this.readBodyCapped(response, MAX_AUDIO_BYTES)

    if (ciphering) {
      buffer = this.decrypt(buffer, ciphering)
      this.logger.log(`Decrypted audio (${ciphering.algorithm}): ${Math.round(buffer.length / 1024)}KB`)
    }

    this.logger.log(`Downloaded ${Math.round(buffer.length / 1024)}KB audio. Transcribing...`)

    const result = await this.provider.transcribe(buffer, mimeType)

    this.logger.debug(
      `Transcription complete (lang=${result.language ?? 'unknown'}, duration=${result.duration ?? '?'}s, ` +
        `${result.text.length} chars)`,
    )

    return result
  }

  /**
   * Reject the URL unless it is http(s) and every address its host resolves
   * to is publicly routable. Mitigates SSRF against internal services and
   * cloud metadata endpoints. (Residual DNS-rebinding risk between this
   * lookup and the fetch is accepted — closing it fully requires IP pinning.)
   */
  private async assertSafeUrl(url: string): Promise<void> {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error('Invalid media URL.')
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`Unsupported media URL scheme: ${parsed.protocol}`)
    }

    const host = parsed.hostname
    const literalIp = isIP(host)
    const addresses = literalIp ? [host] : (await lookup(host, { all: true })).map((a) => a.address)

    if (addresses.length === 0) {
      throw new Error(`Media host did not resolve: ${host}`)
    }
    for (const addr of addresses) {
      if (this.isPrivateAddress(addr)) {
        throw new Error(`Media host resolves to a non-routable address: ${host}`)
      }
    }
  }

  /** True for loopback/link-local/private/unique-local/unspecified addresses. */
  private isPrivateAddress(ip: string): boolean {
    if (isIP(ip) === 4) {
      const [a, b] = ip.split('.').map(Number)
      if (a === 10 || a === 127 || a === 0) return true
      if (a === 172 && b >= 16 && b <= 31) return true
      if (a === 192 && b === 168) return true
      if (a === 169 && b === 254) return true // link-local / cloud metadata
      if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
      return false
    }

    const v6 = ip.toLowerCase().split('%')[0]
    if (v6 === '::' || v6 === '::1') return true
    if (v6.startsWith('fe80')) return true // link-local
    if (v6.startsWith('fc') || v6.startsWith('fd')) return true // unique-local
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — re-check the embedded v4.
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return this.isPrivateAddress(mapped[1])
    return false
  }

  /** Read the response body, aborting if it exceeds maxBytes (handles a missing/lying Content-Length). */
  private async readBodyCapped(response: Response, maxBytes: number): Promise<Buffer> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Empty media response body.')
    }

    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > maxBytes) {
          await reader.cancel()
          throw new Error(`Audio exceeds the ${maxBytes} byte limit.`)
        }
        chunks.push(value)
      }
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)))
  }

  private decrypt(encrypted: Buffer, ciphering: AudioCiphering): Buffer {
    const algorithm = String(ciphering.algorithm ?? '').toLowerCase()
    const spec = ALLOWED_CIPHERS[algorithm]
    if (!spec) {
      throw new Error(`Unsupported ciphering algorithm: ${ciphering.algorithm}`)
    }

    const key = this.decodeHex(ciphering.parameters?.['key'], 'key', spec.keyBytes)
    const iv = this.decodeHex(ciphering.parameters?.['iv'], 'iv', spec.ivBytes)

    const decipher = createDecipheriv(algorithm, key, iv)
    if (spec.aead) {
      const authTag = this.decodeHex(ciphering.parameters?.['authTag'], 'authTag', GCM_AUTH_TAG_BYTES)
      ;(decipher as DecipherGCM).setAuthTag(authTag)
    }
    // decipher.final() throws on a bad GCM auth tag — integrity is enforced.
    return Buffer.concat([decipher.update(encrypted), decipher.final()])
  }

  private decodeHex(value: unknown, field: string, expectedBytes: number): Buffer {
    if (typeof value !== 'string' || !/^[0-9a-fA-F]+$/.test(value)) {
      throw new Error(`Ciphering parameter "${field}" must be a hex string.`)
    }
    const buf = Buffer.from(value, 'hex')
    if (buf.length !== expectedBytes) {
      throw new Error(`Ciphering parameter "${field}" must be ${expectedBytes} bytes, got ${buf.length}.`)
    }
    return buf
  }
}
