import { RIBBON_COLORS } from '../../shared/ribbon'

export function ColorPicker({
  value,
  onChange,
  testPrefix,
}: {
  value: string
  onChange: (color: string) => void
  testPrefix: string
}) {
  return (
    <div className="colors" role="radiogroup" aria-label="Car color">
      {RIBBON_COLORS.map((color, index) => (
        <button
          key={color}
          type="button"
          className={value === color ? 'swatch on' : 'swatch'}
          style={{ background: color }}
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          data-testid={`${testPrefix}-${index}`}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  )
}
