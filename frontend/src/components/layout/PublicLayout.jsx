import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'

export default function PublicLayout() {
  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">Lewati ke konten utama</a>
      <Navbar />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
