import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'
import CatalogNotice from '../../features/catalog/CatalogNotice'

export default function PublicLayout() {
  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Navbar />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <CatalogNotice />
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
