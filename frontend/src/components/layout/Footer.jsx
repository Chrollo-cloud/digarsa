import { Link } from 'react-router-dom'
import { publicNavigation } from '../../data/navigation'
import Wordmark from './Wordmark'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__grid">
        <div>
          <Wordmark />
          <p>Where Ideas Meet Talent.</p>
          <p><a href="mailto:digarsaofficial@gmail.com">digarsaofficial@gmail.com</a></p>
        </div>
        <nav aria-label="Navigasi footer">
          {publicNavigation.map(({ to, label }) => <Link key={to} to={to}>{label}</Link>)}
          <a href="mailto:digarsaofficial@gmail.com">Layanan Pengaduan</a>
        </nav>
        <small>© {new Date().getFullYear()} DIGARSA — INDONESIA</small>
      </div>
    </footer>
  )
}
