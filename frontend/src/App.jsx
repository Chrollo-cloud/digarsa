import { BrowserRouter, Route, Routes } from "react-router-dom";
import PublicLayout from "./components/layout/PublicLayout";
import RouteShell from "./pages/RouteShell";
import HomePage from "./pages/HomePage";
import "./App.css";

const pages = [
  ["/marketplace", "Marketplace", "MARKETPLACE"],
  ["/how-it-works", "Cara Kerja", "HOW IT WORKS"],
  ["/about", "Tentang Digarsa", "ABOUT"],
  ["/login", "Masuk", "LOGIN"],
  ["/register", "Buat Akun", "REGISTER"],
  ["/become-a-creator", "Jadi Kreator", "CREATOR"],
];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route
            path="/seller/:id"
            element={<RouteShell title="Profil kreator" label="CREATOR" />}
          />
          {pages.map(([path, title, label]) => (
            <Route
              key={path}
              path={path}
              element={<RouteShell title={title} label={label} />}
            />
          ))}
          <Route
            path="*"
            element={<RouteShell title="Halaman tidak ditemukan" label="404" />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
