/**
 * PrintSafe End-to-End Test
 * Mirrors the exact browser crypto flow:
 *   encrypt → upload → fetch metadata → fetch ciphertext → decrypt → verify
 */

const BASE = 'http://localhost:3000'

// ── helpers ──────────────────────────────────────────────────────────────────

function base64urlEncode(buf) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return Buffer.from(binary, 'binary').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const rem = padded.length % 4
  const padded2 = rem === 0 ? padded : padded + '='.repeat(4 - rem)
  return Buffer.from(padded2, 'base64').buffer
}

const subtle = globalThis.crypto.subtle

async function encryptData(plaintext) {
  const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const ivBytes = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const iv = base64urlEncode(ivBytes.buffer)
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv: ivBytes }, key, plaintext)
  const keyStr = base64urlEncode(await subtle.exportKey('raw', key))
  return { ciphertext, iv, keyStr }
}

async function decryptData(ciphertext, keyStr, ivStr) {
  const raw = base64urlDecode(keyStr)
  const key = await subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['decrypt'])
  const iv = new Uint8Array(base64urlDecode(ivStr))
  return subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
}

function pass(msg) { console.log('  ✓', msg) }
function fail(msg) { console.error('  ✗', msg); process.exit(1) }

// ── test ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\nPrintSafe E2E Test\n')

  // Test data — small (< 4 KB) and large (> 8 KB) to cover the pool-offset bug
  const testCases = [
    { label: 'Small file (100 bytes)', data: Buffer.alloc(100, 0xAB) },
    { label: 'Medium file (3 KB)',     data: Buffer.alloc(3000, 0xCD) },
    { label: 'Large file (20 KB)',     data: Buffer.alloc(20000, 0xEF) },
  ]

  for (const { label, data } of testCases) {
    console.log(`── ${label} ──`)

    // 1. Encrypt
    const { ciphertext, iv, keyStr } = await encryptData(data)
    pass(`Encrypted: plaintext=${data.length}B  ciphertext=${ciphertext.byteLength}B  iv=${iv}`)

    // 2. Upload
    const uploadRes = await fetch(`${BASE}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-iv':        iv,
        'x-filename':  encodeURIComponent('test.pdf'),
        'x-filesize':  String(data.length),
        'x-mimetype':  'application/pdf',
        'x-ttl':       '1800',
      },
      body: ciphertext,
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}))
      fail(`Upload failed: ${uploadRes.status} ${JSON.stringify(err)}`)
    }

    const { token, deleteToken } = await uploadRes.json()
    pass(`Uploaded: token=${token}`)

    // 3. Fetch metadata
    const docRes = await fetch(`${BASE}/api/doc/${token}`)
    if (!docRes.ok) fail(`GET /api/doc failed: ${docRes.status}`)
    const meta = await docRes.json()
    if (meta.iv !== iv) fail(`IV mismatch: stored="${meta.iv}" expected="${iv}"`)
    pass(`Metadata OK: iv matches, mimeType=${meta.mimeType}, ttl=${meta.ttlAfterView}`)

    // 4. Fetch ciphertext via file proxy
    const fileRes = await fetch(`${BASE}/api/file/${token}`)
    if (!fileRes.ok) fail(`GET /api/file failed: ${fileRes.status}`)
    const receivedCiphertext = await fileRes.arrayBuffer()
    pass(`File proxy OK: received ${receivedCiphertext.byteLength} bytes (expected ${ciphertext.byteLength})`)

    if (receivedCiphertext.byteLength !== ciphertext.byteLength) {
      fail(`Size mismatch: got ${receivedCiphertext.byteLength} expected ${ciphertext.byteLength}`)
    }

    // 5. Decrypt
    let plaintext
    try {
      plaintext = await decryptData(receivedCiphertext, keyStr, meta.iv)
    } catch (e) {
      fail(`Decryption FAILED: ${e.message}`)
    }

    // 6. Verify bytes
    const decoded = Buffer.from(plaintext)
    if (decoded.length !== data.length) fail(`Length mismatch after decrypt: ${decoded.length} vs ${data.length}`)
    if (!decoded.equals(data)) fail(`Byte content mismatch after decrypt`)
    pass(`Decryption OK: ${decoded.length} bytes match original`)

    // 7. Verify one-time access (second call to /api/doc should return 410)
    const secondDocRes = await fetch(`${BASE}/api/doc/${token}`)
    if (secondDocRes.status !== 410) {
      fail(`One-time access NOT enforced: second /api/doc returned ${secondDocRes.status}, expected 410`)
    }
    pass(`One-time access OK: second access → 410`)

    // 8. Cleanup (delete doc)
    const delRes = await fetch(`${BASE}/api/doc/${token}`, {
      method: 'DELETE',
      headers: { 'x-delete-token': deleteToken },
    })
    if (!delRes.ok) fail(`Delete failed: ${delRes.status}`)
    pass(`Deleted OK`)

    console.log()
  }

  console.log('All tests passed ✓\n')
}

run().catch(e => { console.error('Unhandled error:', e); process.exit(1) })
