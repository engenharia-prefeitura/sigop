
import React from 'react';
import { createHashRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import Editor from './pages/Editor';
import Settings from './pages/Settings';
import Projects from './pages/Projects';
import ProjectDetails from './pages/ProjectDetails';
import Users from './pages/Users';
import Notifications from './pages/Notifications';
import PrintPreview from './pages/PrintPreview';
import GeneralReportPreview from './pages/GeneralReportPreview';
import DesignProjects from './pages/DesignProjects';
import FieldSurveys from './pages/FieldSurveys';
import AIAssistantSettings from './pages/AIAssistantSettings';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { AuthProvider, useAuth } from './components/AuthContext';
import { AgendaNotifier } from './components/Agenda';

// --- Guards & Layouts ---

const LoadingSpinner = () => (
  <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark">
    <div className="size-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
  </div>
);

// Guards routes that require authentication
const AuthGuard = () => {
  const { session, user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (!session && !user) return <Navigate to="/login" replace />;

  return <Outlet />;
};

// Guards login route (redirects if already logged in)
const PublicGuard = () => {
  const { session, user, loading, isOfflineSession } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (session || user) return <Navigate to={isOfflineSession ? "/field-surveys" : "/"} replace />;

  return <Outlet />;
};

// Main Layout with Sidebar and Header
const MainLayout = () => {
  const { signOut } = useAuth();
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background-light dark:bg-background-dark">
      <AgendaNotifier />
      <Sidebar onLogout={signOut} />
      <div className="flex flex-1 flex-col overflow-hidden relative">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

// --- Router Definition ---

const router = createHashRouter([
  {
    element: <PublicGuard />,
    children: [
      { path: "/login", element: <Login /> }
    ]
  },
  {
    element: <AuthGuard />,
    children: [
      // Print Routes (No Sidebar/Header)
      { path: "/print/:id", element: <PrintPreview /> },
      { path: "/print-notification/:id", element: <PrintPreview mode="notification" /> },
      { path: "/print-report", element: <GeneralReportPreview /> },

      // Main App Routes (With Sidebar/Header)
      {
        element: <MainLayout />,
        children: [
          { path: "/", element: <Dashboard /> },
          { path: "/documents", element: <Documents /> },
          { path: "/projects", element: <Projects /> },
          { path: "/projects/:id", element: <ProjectDetails /> },
          { path: "/users", element: <Users /> },
          { path: "/designs", element: <DesignProjects /> },
          { path: "/editor/:id", element: <Editor /> },
          { path: "/notifications", element: <Notifications /> },
          { path: "/field-surveys", element: <FieldSurveys /> },
          { path: "/ai-assistant", element: <AIAssistantSettings /> },
          { path: "/settings", element: <Settings /> },
        ]
      }
    ]
  },
  { path: "*", element: <Navigate to="/" replace /> }
]);

const App: React.FC = () => {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
};

export default App;
