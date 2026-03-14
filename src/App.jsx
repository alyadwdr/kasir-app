import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Kasir from './pages/Kasir'
import Stok from './pages/Stok'
import Laporan from './pages/Laporan'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-neutral-400 text-sm">Memuat...</div>
    </div>
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/kasir" replace /> : <Login />} />
        <Route path="/kasir" element={<ProtectedRoute session={session}><Kasir /></ProtectedRoute>} />
        <Route path="/stok" element={<ProtectedRoute session={session}><Stok /></ProtectedRoute>} />
        <Route path="/laporan" element={<ProtectedRoute session={session}><Laporan /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={session ? "/kasir" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  )
}