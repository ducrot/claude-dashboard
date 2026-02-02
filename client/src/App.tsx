import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { MainLayout } from '@/components/layout'
import Dashboard from '@/pages/Dashboard'
import Plans from '@/pages/Plans'
import PlanDetail from '@/pages/PlanDetail'
import Tasks from '@/pages/Tasks'
import Todos from '@/pages/Todos'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="plans" element={<Plans />} />
          <Route path="plans/:filename" element={<PlanDetail />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="todos" element={<Todos />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
