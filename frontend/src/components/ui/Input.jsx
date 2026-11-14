import { useId } from 'react'

export default function Input({ label, hint, error, id, ...props }) {
  const generatedId = useId()
  const inputId = id || generatedId
  const description = error || hint
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input
        {...props}
        id={inputId}
        className="field__control"
        aria-invalid={error ? true : undefined}
        aria-describedby={description ? `${inputId}-description` : undefined}
      />
      {description && (
        <span id={`${inputId}-description`} className={error ? 'field__error' : 'field__hint'}>
          {description}
        </span>
      )}
    </div>
  )
}
