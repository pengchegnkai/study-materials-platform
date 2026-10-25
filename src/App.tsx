import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import SubjectPage from './pages/SubjectPage';
import PreviewPage from './pages/PreviewPage';
import LoginPage from './pages/LoginPage';
import TeacherPage from './pages/TeacherPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';

/** 页面切换 fade-in 150ms（不做滑动/弹跳） */
function FadeIn({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  useEffect(() => {
    // key 变化时重新触发动画
  }, [location.pathname]);
  return <div key={location.pathname} className="animate-fade-in">{children}</div>;
}

export default function App() {
  return (
    <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Layout>
              <FadeIn>
                <HomePage />
              </FadeIn>
            </Layout>
          }
        />
        <Route
          path="/subject/:slug"
          element={
            <Layout>
              <FadeIn>
                <SubjectPage />
              </FadeIn>
            </Layout>
          }
        />
        <Route
          path="/preview"
          element={
            <Layout>
              <ProtectedRoute>
                <FadeIn>
                  <PreviewPage />
                </FadeIn>
              </ProtectedRoute>
            </Layout>
          }
        />
        <Route
          path="/teacher"
          element={
            <Layout>
              <ProtectedRoute roles={['teacher', 'admin']}>
                <FadeIn>
                  <TeacherPage />
                </FadeIn>
              </ProtectedRoute>
            </Layout>
          }
        />
        <Route
          path="/admin"
          element={
            <Layout>
              <ProtectedRoute roles={['admin']}>
                <FadeIn>
                  <AdminPage />
                </FadeIn>
              </ProtectedRoute>
            </Layout>
          }
        />
        <Route
          path="/profile"
          element={
            <Layout>
              <ProtectedRoute>
                <FadeIn>
                  <ProfilePage />
                </FadeIn>
              </ProtectedRoute>
            </Layout>
          }
        />
        <Route
          path="*"
          element={
            <Layout>
              <FadeIn>
                <div className="py-24 text-center text-ink-secondary">页面不存在</div>
              </FadeIn>
            </Layout>
          }
        />
    </Routes>
  );
}
