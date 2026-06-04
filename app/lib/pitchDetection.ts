export interface NoteEvent {
  midi: number          // -1 = rest/silence
  beats: number         // duration in quarter-note beats
  vexDuration: string   // VexFlow duration key: 'w','h','q','8','16'
  accidental: string | null
}

const VEXFLOW_NOTES: { base: string; acc: string | null }[] = [
  { base: 'c', acc: null  },   // C
  { base: 'c', acc: '#'   },   // C#
  { base: 'd', acc: null  },   // D
  { base: 'd', acc: '#'   },   // D#
  { base: 'e', acc: null  },   // E
  { base: 'f', acc: null  },   // F
  { base: 'f', acc: '#'   },   // F#
  { base: 'g', acc: null  },   // G
  { base: 'g', acc: '#'   },   // G#
  { base: 'a', acc: null  },   // A
  { base: 'a', acc: '#'   },   // A#
  { base: 'b', acc: null  },   // B
]

const DURATIONS: { vex: string; beats: number }[] = [
  { vex: 'w',  beats: 4    },
  { vex: 'h',  beats: 2    },
  { vex: 'q',  beats: 1    },
  { vex: '8',  beats: 0.5  },
  { vex: '16', beats: 0.25 },
]

function nearestDuration(rawBeats: number): { vex: string; beats: number } {
  let best = DURATIONS[2]
  let bestDiff = Infinity
  for (const d of DURATIONS) {
    const diff = Math.abs(rawBeats - d.beats)
    if (diff < bestDiff) { bestDiff = diff; best = d }
  }
  return best
}

function detectPitch(
  data: Float32Array, start: number, winSize: number, sr: number
): number {
  let rms = 0
  for (let i = start; i < start + winSize; i++) rms += data[i] * data[i]
  if (Math.sqrt(rms / winSize) < 0.012) return -1

  const minTau = Math.floor(sr / 1200)
  const maxTau = Math.min(Math.floor(sr / 65), Math.floor(winSize / 2) - 1)

  let bestTau = -1
  let bestR = 0

  for (let tau = minTau; tau <= maxTau; tau++) {
    let num = 0, d1 = 0, d2 = 0
    const n = winSize - tau
    for (let i = 0; i < n; i++) {
      const a = data[start + i]
      const b = data[start + i + tau]
      num += a * b
      d1  += a * a
      d2  += b * b
    }
    const denom = d1 * d2
    const r = denom > 0 ? num / Math.sqrt(denom) : 0
    if (r > bestR) { bestR = r; bestTau = tau }
  }

  if (bestR < 0.78 || bestTau < 0) return -1
  return sr / bestTau
}

function freqToMidi(freq: number): number {
  if (freq <= 0) return -1
  const midi = Math.round(12 * Math.log2(freq / 440) + 69)
  return midi >= 36 && midi <= 96 ? midi : -1
}

export async function analyzeAudio(
  file: File,
  onProgress?: (p: number) => void
): Promise<{ notes: NoteEvent[]; bpm: number }> {
  const BPM = 120
  const HOP  = 1024
  const WIN  = 2048
  const MAX_SECONDS = 40

  onProgress?.(0.05)

  const ctx  = new AudioContext()
  const buf  = await ctx.decodeAudioData(await file.arrayBuffer())
  await ctx.close()

  onProgress?.(0.2)

  const data  = buf.getChannelData(0)
  const sr    = buf.sampleRate
  const limit = Math.min(data.length, sr * MAX_SECONDS)
  const total = Math.floor((limit - WIN) / HOP)

  const pitches: number[] = []
  for (let i = 0; i < total; i++) {
    const freq = detectPitch(data, i * HOP, WIN, sr)
    pitches.push(freqToMidi(freq))
    if (i % 40 === 0) onProgress?.(0.2 + 0.65 * (i / total))
  }

  onProgress?.(0.87)

  // Median smooth (window = 3)
  const smoothed = pitches.map((_, i) => {
    const w = pitches.slice(Math.max(0, i - 1), i + 2).sort((a, b) => a - b)
    return w[Math.floor(w.length / 2)]
  })

  // Segment into runs of same MIDI value
  const frameTime = HOP / sr
  const MIN_DUR   = 0.09
  const segments: { midi: number; dur: number }[] = []
  let cur = smoothed[0], dur = frameTime

  for (let i = 1; i < smoothed.length; i++) {
    if (smoothed[i] === cur) {
      dur += frameTime
    } else {
      if (dur >= MIN_DUR) segments.push({ midi: cur, dur })
      cur = smoothed[i]; dur = frameTime
    }
  }
  if (dur >= MIN_DUR) segments.push({ midi: cur, dur })

  // Convert to NoteEvents
  const raw: NoteEvent[] = segments.map(s => {
    const quarterSec = 60 / BPM
    const { vex, beats } = nearestDuration(s.dur / quarterSec)
    const acc = s.midi >= 0 ? VEXFLOW_NOTES[s.midi % 12].acc : null
    return { midi: s.midi, beats, vexDuration: vex, accidental: acc }
  })

  // Merge consecutive rests
  const merged: NoteEvent[] = []
  for (const n of raw) {
    const last = merged[merged.length - 1]
    if (last && last.midi === -1 && n.midi === -1) {
      const combined = nearestDuration(last.beats + n.beats)
      last.beats = combined.beats; last.vexDuration = combined.vex
    } else {
      merged.push({ ...n })
    }
  }

  onProgress?.(1.0)
  return { notes: merged.slice(0, 96), bpm: BPM }
}

export function midiToVexKey(midi: number): string {
  const { base, acc } = VEXFLOW_NOTES[midi % 12]
  const octave = Math.floor(midi / 12) - 1
  return acc ? `${base}${acc}/${octave}` : `${base}/${octave}`
}
