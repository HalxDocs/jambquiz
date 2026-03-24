import { useState } from 'react'
import Home from './pages/Home'
import SubjectSelect from './pages/SubjectSelect'
import Dashboard from './pages/Dashboard'
import Quiz from './pages/Quiz'
import Results from './pages/Results'
import Admin from './pages/Admin'

export default function App() {
  const [view, setView] = useState('home')
  const [student, setStudent] = useState(null)
  const [lastScore, setLastScore] = useState(null)
  const [adminAuthed, setAdminAuthed] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      {view === 'home' && (
        <Home
          setView={setView}
          setStudent={setStudent}
          setAdminAuthed={setAdminAuthed}
        />
      )}
      {view === 'subjects' && (
        <SubjectSelect
          student={student}
          setStudent={setStudent}
          setView={setView}
        />
      )}
      {view === 'dashboard' && (
        <Dashboard
          student={student}
          setView={setView}
        />
      )}
      {view === 'quiz' && (
        <Quiz
          student={student}
          setView={setView}
          setLastScore={setLastScore}
        />
      )}
      {view === 'results' && (
        <Results
          student={student}
          lastScore={lastScore}
          setView={setView}
        />
      )}
      {view === 'admin' && adminAuthed && (
        <Admin
          setView={setView}
        />
      )}
    </div>
  )
}