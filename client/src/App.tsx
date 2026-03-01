import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { MainLayout } from '@/components/layout'
import Dashboard from '@/pages/Dashboard'
import Plans from '@/pages/Plans'
import PlanDetail from '@/pages/PlanDetail'
import Tasks from '@/pages/Tasks'
import Todos from '@/pages/Todos'
import Projects from '@/pages/Projects'
import ProjectDetail from '@/pages/ProjectDetail'
import SubAgents from '@/pages/SubAgents'
import SubAgentDetail from '@/pages/SubAgentDetail'
import SessionDetail from '@/pages/SessionDetail'
import Memory from '@/pages/Memory'
import MemoryDetail from '@/pages/MemoryDetail'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="plans" element={<Plans />} />
          <Route path="plans/:filename" element={<PlanDetail />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:encodedName" element={<ProjectDetail />} />
          <Route path="sessions/:projectDir/:sessionId" element={<SessionDetail />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="todos" element={<Todos />} />
          <Route path="subagents" element={<SubAgents />} />
          <Route path="subagents/:projectDir/:sessionId/:agentId" element={<SubAgentDetail />} />
          <Route path="memory" element={<Memory />} />
          <Route path="memory/:projectDir/:filename" element={<MemoryDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
