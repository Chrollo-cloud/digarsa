import { useEffect } from 'react'

export default function RouteShell({ title, label }) {
  useEffect(() => {
    document.title = `${title} — Digarsa`
  }, [title])

  return (
    <div className="container route-shell">
      <p className="type-metadata">DIGARSA / {label}</p>
      <h1 className="type-display">{title}<span>.</span></h1>
      <p className="route-shell__status">This page is under development.</p>
      <p className="type-body">Where Ideas Meet Talent.</p>
    </div>
  )
}
