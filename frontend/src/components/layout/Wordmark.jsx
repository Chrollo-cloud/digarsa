import { Link } from 'react-router-dom'

export default function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label="Digarsa, home">
      digarsa<span aria-hidden="true">.</span>
    </Link>
  )
}
