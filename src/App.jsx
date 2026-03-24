import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider }   from './contexts/AuthContext';
import ProtectedRoute     from './components/ProtectedRoute';
import ErrorBoundary      from './components/ErrorBoundary';
import Login        from './pages/Login';
import Home         from './pages/Home';
import Practice     from './pages/Practice';
import Exam         from './pages/Exam';
import SpeedMode    from './pages/SpeedMode';
import Analytics    from './pages/Analytics';
import MistakeBank  from './pages/MistakeBank';
import HighFreq     from './pages/HighFreq';
import FormulaMode  from './pages/FormulaMode';
import SubjectMastery from './pages/SubjectMastery';
import Revision from './pages/Revision';
import FormulaAnalytics from './pages/FormulaAnalytics';
import NotFound     from './pages/NotFound';

function PrivateRoute({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />

            {/* Protected */}
            <Route path="/"          element={<PrivateRoute><Home /></PrivateRoute>} />
            <Route path="/practice"  element={<PrivateRoute><Practice /></PrivateRoute>} />
            <Route path="/exam"      element={<PrivateRoute><Exam /></PrivateRoute>} />
            <Route path="/speed"     element={<PrivateRoute><SpeedMode /></PrivateRoute>} />
            <Route path="/analytics" element={<PrivateRoute><Analytics /></PrivateRoute>} />
            <Route path="/mistakes"  element={<PrivateRoute><MistakeBank /></PrivateRoute>} />
            <Route path="/highfreq"  element={<PrivateRoute><HighFreq /></PrivateRoute>} />
            <Route path="/formula"   element={<PrivateRoute><FormulaMode /></PrivateRoute>} />
            <Route path="/mastery"   element={<PrivateRoute><SubjectMastery /></PrivateRoute>} />
            <Route path="/revision"  element={<PrivateRoute><Revision /></PrivateRoute>} />
            <Route path="/formula-analytics" element={<PrivateRoute><FormulaAnalytics /></PrivateRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </AuthProvider>
  );
}
