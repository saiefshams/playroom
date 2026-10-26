const TEXT = '\uFE0E'

const WHITE: Record<string, string> = {
  k: '\u2654',
  q: '\u2655',
  r: '\u2656',
  b: '\u2657',
  n: '\u2658',
  p: '\u2659',
}

const BLACK: Record<string, string> = {
  k: '\u265A',
  q: '\u265B',
  r: '\u265C',
  b: '\u265D',
  n: '\u265E',
  p: '\u265F',
}

export function Piece({ code }: { code: string }) {
  const white = code.startsWith('w')
  const kind = code[1] ?? 'p'
  const glyph = (white ? WHITE[kind] : BLACK[kind]) ?? BLACK.p
  return (
    <span className={white ? 'piece white' : 'piece black'} aria-hidden="true">
      {glyph}
      {TEXT}
    </span>
  )
}
