
import { 
  initSupabase, 
  fetchCloudClients, 
  upsertCloudClient, 
  deleteCloudClient, 
  subscribeToClients, 
  unsubscribeFromClients, 
  checkConnection, 
  upsertCloudUser,
  fetchGlobalSyncStatus,
  subscribeToGlobalSync,
  fetchSanctionsTotalCount,
  upsertCloudSanctions,
  deleteStaleSanctions,
  fetchClientsTotalCount,
  screenEntityAgainstDb,
  screenEntityAdvanced,
  validateRegistrySchemaV431,
  logAuditEvent,
  fetchSystemLogs,
  fetchGlobalRiskCounts,
  setGlobalSyncLock,
  logIngestionEvent,
  fetchGlobalEnvironment,
  setGlobalEnvironment,
  subscribeToGlobalEnvironment,
  deleteCloudUser
} from './services/cloudDb';
import { deleteClientDocuments } from './services/storageService';
import { OFFICIAL_UN_XML_URL, QATAR_NCTC_PORTAL_URL, fetchAndNormalize } from './services/unSanctionsService';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ClientManager from './components/ClientManager';
import SanctionsRegistry from './components/SanctionsRegistry';
import AdminPanel from './components/AdminPanel';
import Login from './components/Login';
import LandingPage from './components/LandingPage';
import PasswordUpdate from './components/PasswordUpdate';
import { Client, AppSettings, UserProfile, SystemEnvironment, ScreeningProgress, SystemLog, KYCStatus, RiskLevel } from './types';

const DEFAULT_SETTINGS: AppSettings = {
  autoSync: true,
  syncIntervalMinutes: 60,
  sourceUrl: OFFICIAL_UN_XML_URL,
  lastSync: 'Never',
  nextSync: '',
  environment: SystemEnvironment.PRODUCTION
};

const CLIENTS_PER_PAGE = 15;
const SYNC_HOUR = 8;
const SYNC_MINUTE = 0;

const App: React.FC = () => {
  const [isBooting, setIsBooting] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('unsg_session');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });
  
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsCount, setClientsCount] = useState(0);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [currentClientsPage, setCurrentClientsPage] = useState(1);
  const [isRefreshingClients, setIsRefreshingClients] = useState(false);
  
  const [riskSummary, setRiskSummary] = useState<Record<RiskLevel, number>>({
    [RiskLevel.HIGH]: 0,
    [RiskLevel.MEDIUM]: 0,
    [RiskLevel.LOW]: 0,
    [RiskLevel.NONE]: 0
  });

  const currentPageRef = useRef(1);
  const clientSearchRef = useRef('');

  const [screeningProgress, setScreeningProgress] = useState<ScreeningProgress>({
    totalRecords: 0,
    screenedRecords: 0,
    pendingRecords: 0,
    status: 'Not Started',
    currentBatch: 0
  });

  const [isGlobalSyncing, setIsGlobalSyncing] = useState(false);
  const [sanctionsCount, setSanctionsCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTING' | 'CONNECTED' | 'ERROR' | 'SAFE_MODE'>('CONNECTING');
  const [schemaDiscrepancies, setSchemaDiscrepancies] = useState<string[]>([]);
  const [globalEnvironment, setGlobalEnvironmentState] = useState<SystemEnvironment>(SystemEnvironment.PRODUCTION);
  
  const [registryStats, setRegistryStats] = useState(() => {
    try {
      const saved = localStorage.getItem('unsg_registry_stats');
      return saved ? JSON.parse(saved) : { lastFetch: 'Never', lastTest: 'Never', lastSourceUpdate: 'Never', syncProgress: 0, currentSyncSource: '' };
    } catch (e) { return { lastFetch: 'Never', lastTest: 'Never', lastSourceUpdate: 'Never', syncProgress: 0, currentSyncSource: '' }; }
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const stored = localStorage.getItem('unsg_settings');
    return stored ? JSON.parse(stored) : { ...DEFAULT_SETTINGS };
  });

  const subscriptionRef = useRef<any>(null);
  const syncChannelRef = useRef<any>(null);
  const envChannelRef = useRef<any>(null);

  const updateLocalRefreshTimestamp = useCallback(() => {
    const now = new Date().toLocaleString();
    setRegistryStats((prev: any) => {
      const next = { ...prev, lastFetch: now };
      localStorage.setItem('unsg_registry_stats', JSON.stringify(next));
      return next;
    });
  }, []);

  const loadLogs = useCallback(async () => {
    const logs = await fetchSystemLogs();
    setSystemLogs(logs);
  }, []);

  const handleGlobalMetadataUpdate = useCallback((meta: any) => {
    if (!meta) return;
    setIsGlobalSyncing(!!meta.is_syncing);
    setRegistryStats((prev: any) => {
      const next = { 
        ...prev, 
        lastSourceUpdate: (meta.last_sync && meta.last_sync !== 'In Progress...' && meta.last_sync !== 'Uninitialized') ? meta.last_sync : prev.lastSourceUpdate,
        syncProgress: meta.progress || 0,
        currentSyncSource: meta.current_source || ''
      };
      localStorage.setItem('unsg_registry_stats', JSON.stringify(next));
      return next;
    });
    
    if (meta.last_sync && meta.last_sync !== 'In Progress...' && !meta.is_syncing) {
      loadSanctionsCache();
      loadLogs();
    }
  }, [loadLogs]);

  const loadSanctionsCache = useCallback(async () => {
    try {
      const count = await fetchSanctionsTotalCount();
      setSanctionsCount(count); 
      updateLocalRefreshTimestamp();
    } catch (e) { console.error("[App] Cache Refresh Failure:", e); }
  }, [updateLocalRefreshTimestamp]);

  const refreshClients = useCallback(async (page: number = 1) => {
    setIsRefreshingClients(true);
    currentPageRef.current = page;
    try {
      const from = (page - 1) * CLIENTS_PER_PAGE;
      const to = from + CLIENTS_PER_PAGE - 1;
      const [cloudClients, count, globalRisks] = await Promise.all([
        fetchCloudClients(from, to, currentUser?.role, currentUser?.id, clientSearchRef.current),
        fetchClientsTotalCount(clientSearchRef.current),
        fetchGlobalRiskCounts()
      ]);
      if (cloudClients) setClients(cloudClients);
      setClientsCount(count);
      setRiskSummary(globalRisks);
      setCurrentClientsPage(page);
      updateLocalRefreshTimestamp();
    } catch (e) { 
      setConnectionStatus('SAFE_MODE');
    } finally { setIsRefreshingClients(false); }
  }, [updateLocalRefreshTimestamp]);

  // --- SCHEDULED 08:00 AM BACKGROUND UPDATE ENGINE ---
  useEffect(() => {
    if (!settings.autoSync || connectionStatus !== 'CONNECTED') return;

    const runAutomatedSync = async () => {
      if (isGlobalSyncing) return;

      const now = new Date();
      const currentDay = now.toISOString().split('T')[0];
      const lastSyncDay = localStorage.getItem('unsg_last_auto_sync_day');

      const isSyncWindow = now.getHours() >= SYNC_HOUR && (now.getHours() > SYNC_HOUR || now.getMinutes() >= SYNC_MINUTE);
      
      if (!isSyncWindow || lastSyncDay === currentDay) return;

      try {
        const currentMeta = await fetchGlobalSyncStatus();
        if (currentMeta?.is_syncing) return;

        const sources = [
          { name: "UN Security Council", url: OFFICIAL_UN_XML_URL },
          { name: "Qatar NCTC", url: QATAR_NCTC_PORTAL_URL }
        ];

        for (const src of sources) {
          const syncStartTime = new Date().toISOString();
          const actionTag = globalEnvironment === SystemEnvironment.SANDBOX ? 'SANDBOX_SYNC_SIMULATION' : 'REGISTRY_SCHEDULED_SYNC_START';
          
          await logAuditEvent(actionTag, `Executing daily state sync for ${src.name}${globalEnvironment === SystemEnvironment.SANDBOX ? ' (SIMULATION)' : ''}.`, 'System Engine');
          await setGlobalSyncLock(true, 'In Progress...', 0, src.name);

          const entries = await fetchAndNormalize(src.url, src.name, syncStartTime);
          if (entries.length > 0) {
            await upsertCloudSanctions(entries, async (progress) => {
              if (progress % 10 === 0) {
                 await setGlobalSyncLock(true, 'In Progress...', progress, src.name);
              }
            });
            
            await deleteStaleSanctions(src.name, syncStartTime);

            await logIngestionEvent({ 
              timestamp: new Date().toISOString(), 
              source: src.name, 
              method: 'Automated', 
              status: 'Success', 
              recordsProcessed: entries.length, 
              triggeredBy: `System Engine (${globalEnvironment})`
            });
            await logAuditEvent('REGISTRY_SCHEDULED_SYNC_SUCCESS', `Daily Sync Complete: ${entries.length} identities maintained.`, 'System Engine');
          }
        }

        localStorage.setItem('unsg_last_auto_sync_day', currentDay);
        const syncTime = new Date().toLocaleString();
        await setGlobalSyncLock(false, syncTime, 100, '');
        loadLogs();
      } catch (err: any) {
        await setGlobalSyncLock(false, "Failed: " + new Date().toLocaleString(), 0, '');
        await logAuditEvent('REGISTRY_SYNC_FAULT', `Scheduled sync aborted: ${err.message}`, 'System Engine');
        loadLogs();
      }
    };

    const intervalId = setInterval(runAutomatedSync, 60000);
    runAutomatedSync();
    return () => clearInterval(intervalId);
  }, [settings.autoSync, connectionStatus, isGlobalSyncing, loadLogs, globalEnvironment]);

  const bootEnterpriseNode = useCallback(async () => {
    setConnectionStatus('CONNECTING');
    setSchemaDiscrepancies([]);
    try {
      initSupabase();
      const healthy = await checkConnection();
      if (healthy) {
        const audit = await validateRegistrySchemaV431();
        if (!audit.success) {
           setConnectionStatus('SAFE_MODE');
           setSchemaDiscrepancies(audit.discrepancies || ['Structural Audit Conflict']);
        } else {
           setConnectionStatus('CONNECTED');
        }
        
        const envFromCloud = await fetchGlobalEnvironment();
        if (envFromCloud) setGlobalEnvironmentState(envFromCloud);

        await Promise.all([
          refreshClients(1),
          loadSanctionsCache(),
          loadLogs(),
          fetchGlobalSyncStatus().then(l => l && handleGlobalMetadataUpdate(l))
        ]);

        if (subscriptionRef.current) unsubscribeFromClients(subscriptionRef.current);
        subscriptionRef.current = subscribeToClients(() => refreshClients(currentPageRef.current));
        
        if (syncChannelRef.current) syncChannelRef.current.unsubscribe();
        syncChannelRef.current = subscribeToGlobalSync(handleGlobalMetadataUpdate);

        if (envChannelRef.current) envChannelRef.current.unsubscribe();
        envChannelRef.current = subscribeToGlobalEnvironment((newEnv) => {
          setGlobalEnvironmentState(newEnv);
          setSettings(prev => ({ ...prev, environment: newEnv }));
        });
      } else {
        setConnectionStatus('SAFE_MODE');
      }
    } catch (e: any) { 
      setConnectionStatus('SAFE_MODE');
      refreshClients(1);
    }
    setTimeout(() => setIsBooting(false), 1500);
  }, [handleGlobalMetadataUpdate, loadSanctionsCache, refreshClients, loadLogs]);

  useEffect(() => { bootEnterpriseNode(); }, [bootEnterpriseNode]);

  const handleGlobalBatchScreening = async () => {
    if (screeningProgress.status === 'In Progress') return;
    await logAuditEvent('GLOBAL_BATCH_SCREENING_INITIATED', `Registry-wide screening protocol started.`, currentUser?.email || 'System');
    await loadLogs();

    const totalCount = await fetchClientsTotalCount();
    const allClients: Client[] = [];
    for (let i = 0; i < totalCount; i += 50) {
      const batch = await fetchCloudClients(i, i + 49);
      allClients.push(...batch);
    }

    setScreeningProgress({ totalRecords: totalCount, screenedRecords: 0, pendingRecords: totalCount, status: 'In Progress', currentBatch: 0 });

    for (let i = 0; i < allClients.length; i++) {
      const client = allClients[i];
      try {
        const screened = await screenEntityAgainstDb(client, currentUser?.email);
        await upsertCloudClient(screened);
      } catch (err) {}
      setScreeningProgress(prev => ({ ...prev, screenedRecords: i + 1, pendingRecords: totalCount - (i + 1) }));
    }

    const finalRiskSummary = await fetchGlobalRiskCounts();
    setRiskSummary(finalRiskSummary);
    setScreeningProgress(prev => ({ ...prev, status: 'Completed' }));
    await logAuditEvent('GLOBAL_BATCH_SCREENING_COMPLETED', `Processed screening for ${totalCount} records.`, currentUser?.email || 'System');
    await loadLogs();
    setTimeout(() => setScreeningProgress(prev => ({ ...prev, status: 'Not Started' })), 10000);
  };

  const handleAddClientWithAuthoritativeScreening = async (newClient: Client) => {
    setIsRefreshingClients(true);
    try {
      const screenedClient = await screenEntityAgainstDb(newClient, currentUser?.email);
      await upsertCloudClient(screenedClient);
      await refreshClients(currentClientsPage); 
    } catch (e: any) { 
      if (e.message?.includes('fetch')) {
        setConnectionStatus('SAFE_MODE');
        await refreshClients(currentClientsPage);
      } else throw e;
    } finally { setIsRefreshingClients(false); }
  };

  const handleAdvancedScreening = async (client: Client) => {
    setIsRefreshingClients(true);
    try {
      const screenedClient = await screenEntityAdvanced(client, currentUser?.email);
      await upsertCloudClient(screenedClient);
      await refreshClients(currentClientsPage);
      return screenedClient;
    } catch (e: any) {
      console.error("[Advanced Scan] Failure:", e);
      throw e;
    } finally {
      setIsRefreshingClients(false);
    }
  };

  const handleUpdateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('unsg_settings', JSON.stringify(newSettings));
    
    // Propagate environment change to the cloud registry globally
    if (newSettings.environment !== globalEnvironment) {
       await setGlobalEnvironment(newSettings.environment);
       setGlobalEnvironmentState(newSettings.environment);
       await logAuditEvent('SYSTEM_ENVIRONMENT_MODIFIED', `Global cluster environment set to ${newSettings.environment}.`, currentUser?.email || 'System');
       await loadLogs();
    }
  };

  const handleDeleteClient = async (id: string) => {
    setIsRefreshingClients(true);
    try {
      // 1. Delete associated documents from storage first
      await deleteClientDocuments(id);
      
      // 2. Delete client record from database
      await deleteCloudClient(id);
      
      await refreshClients(currentClientsPage);
    } catch (e: any) { 
      console.error("[App] Client Deletion Failure:", e);
      setConnectionStatus('SAFE_MODE');
    } finally { setIsRefreshingClients(false); }
  };

  const handleUpdateClient = async (updatedClient: Client) => {
    try {
      await upsertCloudClient(updatedClient);
      setClients(prev => {
        const existingIndex = prev.findIndex(c => c.id === updatedClient.id);
        if (existingIndex !== -1) {
          const next = [...prev];
          next[existingIndex] = { ...updatedClient };
          return next;
        }
        return [updatedClient, ...prev];
      });
      const nextRisks = await fetchGlobalRiskCounts();
      setRiskSummary(nextRisks);
    } catch (e: any) { 
      console.error("[App] Client Update Failure:", e);
      setConnectionStatus('SAFE_MODE');
    }
  };

  const handlePasswordUpdate = async (newPassword: string) => {
    if (!currentUser) return;
    try {
      const dbPayload: any = { ...currentUser };
      dbPayload.password_hash_mock = newPassword;
      dbPayload.must_change_password = false;
      await upsertCloudUser(dbPayload);
      const updatedUser = { ...currentUser, must_change_password: false, password_hash_mock: newPassword };
      setCurrentUser(updatedUser);
      localStorage.setItem('unsg_session', JSON.stringify(updatedUser));
      alert("Password updated successfully.");
    } catch (e: any) { alert("Failed to update password: " + e.message); }
  };

  const effectiveEnvironment = globalEnvironment;
  
  return (
    <Router>
      <Routes>
        {/* PUBLIC ROUTES */}
        <Route path="/" element={<LandingPage />} />
        <Route 
          path="/login" 
          element={
            currentUser ? 
            <Navigate to="/dashboard" replace /> : 
            <Login 
              onLogin={(u) => { 
                setCurrentUser(u); 
                localStorage.setItem('unsg_session', JSON.stringify(u)); 
                logAuditEvent('SESSION_INITIALIZED', `User authenticated.`, u.email).then(() => loadLogs());
              }} 
              isCloudConnected={connectionStatus === 'CONNECTED' || connectionStatus === 'SAFE_MODE'} 
            />
          } 
        />

        {/* PROTECTED APP ROUTES */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute 
              currentUser={currentUser} 
              connectionStatus={connectionStatus} 
              schemaDiscrepancies={schemaDiscrepancies} 
              onLogout={() => { 
                logAuditEvent('SESSION_TERMINATED', `User logged out.`, currentUser?.email || '').then(() => loadLogs()); 
                setCurrentUser(null); 
                localStorage.removeItem('unsg_session'); 
                window.location.href = '#/';
              }}
              onRetryConnection={() => bootEnterpriseNode()}
              effectiveEnvironment={effectiveEnvironment}
              onPasswordUpdate={handlePasswordUpdate}
            >
              <Dashboard 
                clients={clients} 
                totalClientsCount={clientsCount} 
                sanctionsCount={sanctionsCount} 
                registryStats={registryStats} 
                isGlobalSyncing={isGlobalSyncing} 
                environment={effectiveEnvironment} 
                riskSummary={riskSummary} 
              />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/clients" 
          element={
            <ProtectedRoute 
              currentUser={currentUser} 
              connectionStatus={connectionStatus} 
              schemaDiscrepancies={schemaDiscrepancies} 
              onLogout={() => { 
                logAuditEvent('SESSION_TERMINATED', `User logged out.`, currentUser?.email || '').then(() => loadLogs()); 
                setCurrentUser(null); 
                localStorage.removeItem('unsg_session'); 
                window.location.href = '#/';
              }}
              onRetryConnection={() => bootEnterpriseNode()}
              effectiveEnvironment={effectiveEnvironment}
              onPasswordUpdate={handlePasswordUpdate}
            >
              <ClientManager 
                clients={clients} 
                totalCount={clientsCount} 
                currentPage={currentClientsPage} 
                onPageChange={refreshClients} 
                isRefreshing={isRefreshingClients} 
                onAddClient={handleAddClientWithAuthoritativeScreening} 
                onDeleteClient={handleDeleteClient} 
                onRefresh={() => refreshClients(currentClientsPage)} 
                onSearch={(term: string) => { clientSearchRef.current = term; refreshClients(1); }} 
                onReScreen={handleGlobalBatchScreening} 
                onUpdateClient={handleUpdateClient} 
                onAdvancedScreening={handleAdvancedScreening} 
                screeningProgress={screeningProgress} 
                currentUserRole={currentUser?.role as any} 
                currentUserId={currentUser?.id as any} 
              />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/sanctions" 
          element={
            <ProtectedRoute 
              currentUser={currentUser} 
              connectionStatus={connectionStatus} 
              schemaDiscrepancies={schemaDiscrepancies} 
              onLogout={() => { 
                logAuditEvent('SESSION_TERMINATED', `User logged out.`, currentUser?.email || '').then(() => loadLogs()); 
                setCurrentUser(null); 
                localStorage.removeItem('unsg_session'); 
                window.location.href = '#/';
              }}
              onRetryConnection={() => bootEnterpriseNode()}
              effectiveEnvironment={effectiveEnvironment}
              onPasswordUpdate={handlePasswordUpdate}
            >
              <SanctionsRegistry 
                onSyncComplete={() => loadSanctionsCache()} 
                isCloudConnected={connectionStatus === 'CONNECTED' || connectionStatus === 'SAFE_MODE'} 
                initialStats={registryStats} 
                isGlobalSyncing={isGlobalSyncing} 
                environment={effectiveEnvironment} 
                currentUser={currentUser as any} 
              />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute 
              currentUser={currentUser} 
              connectionStatus={connectionStatus} 
              schemaDiscrepancies={schemaDiscrepancies} 
              onLogout={() => { 
                logAuditEvent('SESSION_TERMINATED', `User logged out.`, currentUser?.email || '').then(() => loadLogs()); 
                setCurrentUser(null); 
                localStorage.removeItem('unsg_session'); 
                window.location.href = '#/';
              }}
              onRetryConnection={() => bootEnterpriseNode()}
              effectiveEnvironment={effectiveEnvironment}
              onPasswordUpdate={handlePasswordUpdate}
            >
              {(currentUser?.is_system_admin === true) ? (
                <AdminPanel 
                  settings={settings} 
                  logs={systemLogs} 
                  onUpdateSettings={handleUpdateSettings} 
                  currentUser={currentUser} 
                  onLogsRefresh={loadLogs} 
                />
              ) : <Navigate to="/dashboard" replace />}
            </ProtectedRoute>
          } 
        />

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  currentUser: UserProfile | null;
  connectionStatus: string;
  schemaDiscrepancies: string[];
  onLogout: () => void;
  onRetryConnection: () => void;
  effectiveEnvironment: SystemEnvironment;
  onPasswordUpdate: (pwd: string) => Promise<void>;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  currentUser, 
  connectionStatus, 
  schemaDiscrepancies, 
  onLogout, 
  onRetryConnection, 
  effectiveEnvironment,
  onPasswordUpdate
}) => {
  if (!currentUser) return <Navigate to="/" replace />;
  if (currentUser.must_change_password) return <PasswordUpdate user={currentUser} onUpdate={onPasswordUpdate} />;
  
  return (
    <Layout 
      isCloudConnected={connectionStatus === 'CONNECTED'} 
      isConnecting={connectionStatus === 'CONNECTING'} 
      isSafeMode={connectionStatus === 'SAFE_MODE'} 
      schemaFaults={schemaDiscrepancies} 
      onLogout={onLogout} 
      currentUser={currentUser} 
      onRetryConnection={onRetryConnection} 
      environment={effectiveEnvironment}
    >
      {children}
    </Layout>
  );
};

export default App;
