const FFT_SIZE = 1024
const HOP_SIZE = 512
const MAX_W    = 2000
const CANVAS_H = 420
const MIN_FREQ = 30

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang), wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0
      for (let j = 0; j < len >> 1; j++) {
        const half = len >> 1
        const uRe = re[i + j], uIm = im[i + j]
        const vRe = re[i + j + half] * curRe - im[i + j + half] * curIm
        const vIm = re[i + j + half] * curIm + im[i + j + half] * curRe
        re[i + j] = uRe + vRe;        im[i + j] = uIm + vIm
        re[i + j + half] = uRe - vRe; im[i + j + half] = uIm - vIm
        const nr = curRe * wRe - curIm * wIm
        curIm   = curRe * wIm + curIm * wRe
        curRe   = nr
      }
    }
  }
}

const MAGMA: [number, number, number][] = [
  [0,   0,   4],
  [24,  7,   33],
  [59,  8,   62],
  [96,  14,  68],
  [135, 25,  70],
  [179, 46,  60],
  [215, 71,  37],
  [246, 119, 19],
  [252, 253, 191],
]

function magmaColor(t: number): [number, number, number] {
  const n = MAGMA.length - 1
  const i = Math.min(Math.floor(t * n), n - 1)
  const f = t * n - i
  const [r0, g0, b0] = MAGMA[i]
  const [r1, g1, b1] = MAGMA[i + 1]
  return [
    Math.round(r0 + f * (r1 - r0)),
    Math.round(g0 + f * (g1 - g0)),
    Math.round(b0 + f * (b1 - b0)),
  ]
}

function makeHannWindow(size: number): Float32Array {
  const w = new Float32Array(size)
  for (let i = 0; i < size; i++)
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
  return w
}

export async function computeAndDraw(
  file: File,
  canvas: HTMLCanvasElement,
  onProgress: (pct: number) => void,
): Promise<void> {
  const buf = await file.arrayBuffer()
  const audioCtx = new AudioContext()
  const audioBuffer = await audioCtx.decodeAudioData(buf)
  await audioCtx.close()

  const samples  = audioBuffer.getChannelData(0)
  const sr       = audioBuffer.sampleRate
  const maxFreq  = sr / 2
  const numFrames = Math.floor((samples.length - FFT_SIZE) / HOP_SIZE)
  const W        = Math.min(numFrames, MAX_W)
  const frameStep = numFrames / W

  canvas.width  = W
  canvas.height = CANVAS_H

  const ctx       = canvas.getContext('2d')!
  const imageData = ctx.createImageData(W, CANVAS_H)
  const pixels    = imageData.data
  const hann      = makeHannWindow(FFT_SIZE)
  const logMin    = Math.log(MIN_FREQ)
  const logMax    = Math.log(maxFreq)
  const BATCH     = 60

  for (let col = 0; col < W; col++) {
    const start = Math.floor(col * frameStep) * HOP_SIZE
    const re = new Float32Array(FFT_SIZE)
    const im = new Float32Array(FFT_SIZE)
    for (let i = 0; i < FFT_SIZE; i++)
      re[i] = (samples[start + i] ?? 0) * hann[i]

    fft(re, im)

    const mags = new Float32Array(FFT_SIZE / 2)
    for (let i = 0; i < FFT_SIZE / 2; i++) {
      const m = Math.sqrt(re[i] ** 2 + im[i] ** 2)
      mags[i] = m > 0 ? 20 * Math.log10(m) : -120
    }

    for (let row = 0; row < CANVAS_H; row++) {
      const t    = 1 - row / (CANVAS_H - 1)
      const freq = Math.exp(logMin + t * (logMax - logMin))
      const bin  = Math.min(Math.round((freq / maxFreq) * (FFT_SIZE / 2)), FFT_SIZE / 2 - 1)
      const db   = mags[bin]
      const norm = Math.max(0, Math.min(1, (db + 80) / 80))
      const [r, g, b] = magmaColor(norm)
      const idx  = (row * W + col) * 4
      pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b; pixels[idx + 3] = 255
    }

    if (col % BATCH === BATCH - 1) {
      onProgress((col + 1) / W)
      ctx.putImageData(imageData, 0, 0)
      await new Promise(r => setTimeout(r, 0))
    }
  }

  ctx.putImageData(imageData, 0, 0)
  onProgress(1)
}
