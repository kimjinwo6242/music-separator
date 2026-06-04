'use client'

import { useEffect, useRef } from 'react'
import type { NoteEvent } from '@/app/lib/pitchDetection'
import { midiToVexKey } from '@/app/lib/pitchDetection'

interface Props {
  notes: NoteEvent[]
  bpm: number
}

const BEATS_PER_MEASURE = 4

// Layout constants — tuned to match standard engraving proportions.
// VexFlow default: 1 space = 10px, staff height = 4 spaces = 40px.
//
//  ┌─── PAD_Y ────────────────────────────────────────────────────┐
//  │   ABOVE_STAFF (stems / notes above top line)                 │
//  │── stave top line ──────────── staff 40px ──────────────────  │
//  │── stave bottom line ────────────────────────────────────────  │
//  │   BELOW_STAFF (stems / notes below bottom line)              │
//  │   SYSTEM_GAP  (breathing room between rows)                  │
//  │   [next row repeats from ABOVE_STAFF]                        │
//  └──────────────────────────────────────────────────────────────┘
const STAFF_H      = 40   // 4 spaces × 10 px
const ABOVE_STAFF  = 38   // room for stems and high notes
const BELOW_STAFF  = 32   // room for stems and low notes
const SYSTEM_GAP   = 24   // gap between the bottom of one system and top of the next
const ROW_H        = ABOVE_STAFF + STAFF_H + BELOW_STAFF + SYSTEM_GAP  // 134 px

const PER_ROW  = 2
const STAVE_W  = 390   // px per measure column
const PAD_X    = 24
const PAD_Y    = 16

function fillRest(beats: number): { vex: string; beats: number } {
  if (beats >= 4)   return { vex: 'w',  beats: 4    }
  if (beats >= 2)   return { vex: 'h',  beats: 2    }
  if (beats >= 1)   return { vex: 'q',  beats: 1    }
  if (beats >= 0.5) return { vex: '8',  beats: 0.5  }
  return              { vex: '16', beats: 0.25 }
}

type Measure = NoteEvent[]

function buildMeasures(notes: NoteEvent[]): Measure[] {
  const measures: Measure[] = []
  let measure: Measure = []
  let remaining = BEATS_PER_MEASURE

  for (const n of notes) {
    let beats = n.beats
    while (beats > 0) {
      if (beats <= remaining + 0.01) {
        measure.push({ ...n, beats, vexDuration: n.vexDuration })
        remaining -= beats
        beats = 0
      } else if (remaining > 0) {
        const part = fillRest(remaining)
        measure.push({ ...n, beats: part.beats, vexDuration: part.vex })
        beats -= part.beats
        remaining = 0
      } else {
        beats = 0 // safety
      }

      if (remaining <= 0.01) {
        measures.push(measure)
        measure = []
        remaining = BEATS_PER_MEASURE
      }
    }
  }

  if (measure.length > 0) {
    if (remaining > 0.01) {
      const pad = fillRest(remaining)
      measure.push({ midi: -1, beats: pad.beats, vexDuration: pad.vex, accidental: null })
    }
    measures.push(measure)
  }

  return measures
}

export default function SheetMusicView({ notes, bpm }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || notes.length === 0) return
    const container = ref.current
    container.innerHTML = ''
    let cancelled = false

    async function render() {
      const VF = await import('vexflow')
      if (cancelled || !container) return
      const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = VF

      const measures  = buildMeasures(notes)
      const rows      = Math.ceil(measures.length / PER_ROW)

      // Canvas dimensions — height formula accounts for the exact pixel budget per row
      // minus the final SYSTEM_GAP (last row needs no gap below) plus bottom padding.
      const totalW = PAD_X * 2 + STAVE_W * PER_ROW
      const totalH = PAD_Y + rows * ROW_H - SYSTEM_GAP + PAD_Y

      const renderer = new Renderer(container, Renderer.Backends.SVG)
      renderer.resize(totalW, totalH)
      const ctx = renderer.getContext()
      ctx.setFillStyle('#111111')
      ctx.setStrokeStyle('#111111')

      measures.forEach((measure, mi) => {
        const row = Math.floor(mi / PER_ROW)
        const col = mi % PER_ROW

        const x = PAD_X + col * STAVE_W
        // Stave top line sits ABOVE_STAFF px below the start of this row
        const y = PAD_Y + row * ROW_H + ABOVE_STAFF

        const stave = new Stave(x, y, STAVE_W - 8)
        if (col === 0) stave.addClef('treble')
        if (mi  === 0) stave.addTimeSignature('4/4')
        stave.setContext(ctx).draw()

        const staveNotes = measure.map(n => {
          const isRest = n.midi === -1
          const sn = new StaveNote({
            keys:     [isRest ? 'b/4' : midiToVexKey(n.midi)],
            duration: isRest ? `${n.vexDuration}r` : n.vexDuration,
          })
          if (!isRest && n.accidental) {
            sn.addModifier(new Accidental(n.accidental), 0)
          }
          return sn
        })

        const voice = new Voice({ numBeats: 4, beatValue: 4 })
        voice.setMode(2) // SOFT
        voice.addTickables(staveNotes)
        new Formatter().joinVoices([voice]).format([voice], STAVE_W - 72)
        voice.draw(ctx, stave)
      })

      // Remove inline width/height so CSS can scale the SVG via its viewBox.
      // VexFlow already sets viewBox="0 0 W H" — removing the fixed px attributes
      // lets width:100% + height:auto produce correct proportional scaling.
      const svg = container.querySelector('svg')
      if (svg) {
        svg.removeAttribute('width')
        svg.removeAttribute('height')
      }
    }

    render().catch(console.error)
    return () => { cancelled = true }
  }, [notes, bpm])

  if (notes.length === 0) {
    return (
      <div className="rounded-xl bg-white p-6 text-center">
        <p className="text-sm text-gray-400">
          음정이 감지된 음표가 없습니다. 멜로디가 있는 파일을 사용해 보세요.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="w-full overflow-x-auto rounded-xl bg-white px-3 py-2 [&_svg]:w-full [&_svg]:h-auto"
    />
  )
}
