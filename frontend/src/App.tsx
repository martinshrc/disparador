import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { restoreScrollAfterReload } from "@/lib/utils";
import { useDisparoSession } from "@/hooks/useDisparoSession";
import { DispatchBanner } from "@/components/DispatchBanner";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Contacts from "./pages/Contacts";
import ColetarLeads from "./pages/ColetarLeads";
import HistoryPage from "./pages/History";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ScrollRestore() {
  useEffect(() => {
    restoreScrollAfterReload();
  }, []);
  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

/**
 * Wrapper para rotas protegidas que exibe o DispatchBanner global.
 * O banner aparece em TODAS as páginas logadas quando há disparo ativo.
 */
function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { activeSession, cancelSession, dismissSession } = useDisparoSession();

  return (
    <>
      {activeSession && (
        <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-2">
          <DispatchBanner
            session={activeSession}
            onCancel={() => cancelSession(activeSession.id)}
            onDismiss={dismissSession}
          />
        </div>
      )}
      {/* Empurra o conteúdo para baixo quando o banner está visível */}
      <div className={activeSession ? 'pt-16' : undefined}>
        {children}
      </div>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollRestore />
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <ProtectedShell><Index /></ProtectedShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contacts"
            element={
              <ProtectedRoute>
                <ProtectedShell><Contacts /></ProtectedShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/coletar-leads"
            element={
              <ProtectedRoute>
                <ProtectedShell><ColetarLeads /></ProtectedShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <ProtectedShell><HistoryPage /></ProtectedShell>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
