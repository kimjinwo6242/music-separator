const FFT_SIZE = 4096
const HOP_SIZE = 1024

export interface NoteFrame {
  time: number
  midi: number | null
  note: string | null
}

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
        const h = len >> 1
        const uRe = re[i + j], uIm = im[i + j]
        const vRe = re[i + j + h] * curRe - im[i + j + h] * curIm
        const vIm = re[i + j + h] * curIm + im[i + j + h] * curRe
        re[i + j] = uRe + vRe;      im[i + j] = uIm + vIm
        re[i + j + h] = uRe - vRe;  im[i + j + h] = uIm - vIm
        const nr = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nr
      }
    }
  }
}

function makeHann(size: number): Float32Array {
  const w = new Float32Array(size)
  for (let i = 0; i < size; i++)
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
  return w
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function freqToMidi(freq: number): number {
  return Math.round(12 * Math.log2(freq / 440) + 69)
}

function midiToNote(midi: number): string {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1)
}

function hpsScore(mags: Float32Array, bin: number, half: number): number {
  let product = mags[bin]
  for (let h = 2; h <= 5; h++) {
    const hBin = Math.round(bin * h)
    if (hBin >= half) return 0
    product *= mags[hBin]
  }
  return product
}

function detectPitch(mags: Float32Array, sr: number): number | null {
  const freqPerBin = sr / FFT_SIZE
  const minBin = Math.max(1, Math.round(60 / freqPerBin))
  const maxBin = Math.round(1400 / freqPerBin)
  const half = FFT_SIZE / 2

  let best = 0, bestBin = -1
  for (let bin = minBin; bin < maxBin; bin++) {
    const score = hpsScore(mags, bin, half)
    if (score > best) { best = score; bestBin = bin }
  }
  if (bestBin === -1) return null

  // 노이즈 기준
  let avg = 0
  for (let b = minBin; b < maxBin; b++) avg += mags[b]
  avg /= (maxBin - minBin)
  if (mags[bestBin] < avg * 5) return null

  // 옥타브 아래 후보가 충분히 강하면 그쪽을 선택
  // (HPS는 배음이 강할 때 실제 음보다 1옥타브 높은 bin을 선택하는 경향이 있음)
  const subBin = Math.round(bestBin / 2)
  if (subBin >= minBin) {
    const subScore = hpsScore(mags, subBin, half)
    // 하위 옥타브 점수가 25% 이상이면 하위 옥타브를 우선
    if (subScore >= best * 0.25) {
      bestBin = subBin
    }
  }

  return bestBin * freqPerBin
}

// 옥타브 오류 보정 — 여러 번 반복해 안정화
function fixOctaveErrors(frames: NoteFrame[]): NoteFrame[] {
  let midis = frames.map(f => f.midi)
  const N = midis.length

  // 3 pass: 매 pass마다 더 넓은 윈도우로 중앙값 계산 후 최선의 옥타브로 교정
  const PASSES  = [
    { win: 10, minNbrs: 4 },
    { win: 20, minNbrs: 6 },
    { win: 30, minNbrs: 8 },
  ]

  for (const { win, minNbrs } of PASSES) {
    midis = midis.map((midi, i) => {
      if (midi === null) return null

      const nbrs: number[] = []
      for (let j = Math.max(0, i - win); j <= Math.min(N - 1, i + win); j++) {
        if (j !== i && midis[j] !== null) nbrs.push(midis[j]!)
      }
      if (nbrs.length < minNbrs) return midi

      nbrs.sort((a, b) => a - b)
      const median = nbrs[Math.floor(nbrs.length / 2)]

      // ±12, ±24 범위 후보 중 중앙값에 가장 가까운 옥타브를 선택
      let best = midi
      let bestDist = Math.abs(midi - median)
      for (const offset of [-24, -12, 12, 24]) {
        const candidate = midi + offset
        if (candidate < 24 || candidate > 108) continue
        const dist = Math.abs(candidate - median)
        if (dist < bestDist) { bestDist = dist; best = candidate }
      }
      return best
    })
  }

  return frames.map((frame, i) => {
    const newMidi = midis[i]
    if (newMidi === frame.midi) return frame
    return {
      ...frame,
      midi: newMidi,
      note: newMidi !== null && newMidi >= 24 && newMidi <= 96
        ? midiToNote(newMidi)
        : null,
    }
  })
}

export async function analyzePitch(
  file: File,
  onProgress: (pct: number) => void,
): Promise<NoteFrame[]> {
  const buf = await file.arrayBuffer()
  const audioCtx = new AudioContext()
  const audioBuffer = await audioCtx.decodeAudioData(buf)
  await audioCtx.close()

  const samples = audioBuffer.getChannelData(0)
  const sr = audioBuffer.sampleRate
  const hann = makeHann(FFT_SIZE)
  const numFrames = Math.floor((samples.length - FFT_SIZE) / HOP_SIZE)
  const frames: NoteFrame[] = []
  const BATCH = 30

  for (let i = 0; i < numFrames; i++) {
    const start = i * HOP_SIZE

    let rms = 0
    for (let j = 0; j < FFT_SIZE; j++) rms += (samples[start + j] ?? 0) ** 2
    rms = Math.sqrt(rms / FFT_SIZE)

    let freq: number | null = null
    if (rms > 0.005) {
      const re = new Float32Array(FFT_SIZE)
      const im = new Float32Array(FFT_SIZE)
      for (let j = 0; j < FFT_SIZE; j++)
        re[j] = (samples[start + j] ?? 0) * hann[j]
      fft(re, im)

      const mags = new Float32Array(FFT_SIZE / 2)
      for (let j = 0; j < FFT_SIZE / 2; j++)
        mags[j] = Math.sqrt(re[j] ** 2 + im[j] ** 2)

      freq = detectPitch(mags, sr)
    }

    const midi = freq ? freqToMidi(freq) : null
    const note = midi !== null && midi >= 24 && midi <= 96 ? midiToNote(midi) : null

    frames.push({ time: start / sr, midi, note })

    if (i % BATCH === BATCH - 1) {
      onProgress((i + 1) / numFrames)
      await new Promise(r => setTimeout(r, 0))
    }
  }

  onProgress(1)
  return fixOctaveErrors(frames)
}
