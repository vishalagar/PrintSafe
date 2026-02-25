'use client'

// All functions use window.crypto.subtle — no Node imports.
// This file must only be imported from client components.

function base64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlDecode(str: string): ArrayBuffer {
  // Re-pad and convert base64url back to standard base64
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const remainder = padded.length % 4
  const padded2 = remainder === 0 ? padded : padded + '='.repeat(4 - remainder)
  const binary = atob(padded2)
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i)
  }
  return buf.buffer
}

export async function generateKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function encryptFile(
  file: File
): Promise<{ ciphertext: ArrayBuffer; iv: string; key: CryptoKey }> {
  const key = await generateKey()

  const ivBytes = window.crypto.getRandomValues(new Uint8Array(12))
  const iv = base64urlEncode(ivBytes.buffer)

  const plaintext = await file.arrayBuffer()

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    plaintext
  )

  return { ciphertext, iv, key }
}

export async function decryptFile(
  ciphertext: ArrayBuffer,
  key: CryptoKey,
  ivBase64url: string
): Promise<ArrayBuffer> {
  const iv = new Uint8Array(base64urlDecode(ivBase64url))

  return window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
}

export async function keyToBase64url(key: CryptoKey): Promise<string> {
  const raw = await window.crypto.subtle.exportKey('raw', key)
  return base64urlEncode(raw)
}

export async function base64urlToKey(str: string): Promise<CryptoKey> {
  const raw = base64urlDecode(str)
  return window.crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}
