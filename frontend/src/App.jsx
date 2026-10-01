import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './authContext'
import LoginPage from './pages/LoginPage'
import WalletPage from './pages/WalletPage'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route
            path="/wallet"
            element={
              <PrivateRoute>
                <WalletPage />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AuthProvider>
  )
}
