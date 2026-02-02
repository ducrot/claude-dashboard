import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useSSE } from '@/hooks/useSSE'

export function MainLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Connect to SSE for real-time updates
  useSSE()

  return (
    <div className="min-h-screen">
      <Sidebar />

      {/* Mobile sidebar */}
      {mobileMenuOpen && (
        <div className="relative z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto bg-background px-6 pb-4 ring-1 ring-border">
            <Sidebar />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <Header onMenuClick={() => setMobileMenuOpen(true)} />

        <main className="py-6">
          <div className="px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
