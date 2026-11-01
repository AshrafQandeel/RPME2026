
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, Globe, FileText, Settings, Menu, X, Wifi, WifiOff, LogOut, ShieldCheck, Clock, RefreshCw, AlertTriangle, ChevronRight, Share2, Database, Shield, Activity, Beaker, ShieldAlert, Terminal } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { UserProfile, UserRole, SystemEnvironment, APP_VERSION } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  isCloudConnected: boolean;
  isConnecting?: boolean;
  isSafeMode?: boolean;
  schemaFaults?: string[];
  onLogout: () => void;
  currentUser: UserProfile;
  onRetryConnection?: () => void;
  onSettingsRequest?: () => void;
  environment?: SystemEnvironment;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  isCloudConnected, 
  isConnecting, 
  isSafeMode, 
  schemaFaults = [], 
  onLogout, 
  currentUser, 
  onRetryConnection, 
  onSettingsRequest, 
  environment 
}) => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isDiagOpen, setIsDiagOpen] = useState(false);
  const [registryStats, setRegistryStats] = useState({ lastSourceUpdate: 'Never' });
  const location = useLocation();

  const PRIMARY_LOGO = "https://raw.githubusercontent.com/AnasQandeel/RPME-Logo/main/RPME%20Logo.png";
  const LOCAL_LOGO = "/images/logo.png";
  const FALLBACK_LOGO = "https://placehold.co/600x400/064e3b/ffffff?text=RPME+LIMITED+LLC";

  useEffect(() => {
    const updateStats = () => {
      const saved = localStorage.getItem('unsg_registry_stats');
      if (saved) setRegistryStats(JSON.parse(saved));
    };
    updateStats();
    window.addEventListener('storage', updateStats);
    return () => window.removeEventListener('storage', updateStats);
  }, []);

  const navItems = [
    { label: 'System Dashboard', path: '/', icon: <LayoutDashboard size={20} />, roles: ['admin', 'compliance_manager', 'dmlro', 'user'] },
    { label: 'Client Onboarding', path: '/clients', icon: <Users size={20} />, roles: ['admin', 'compliance_manager', 'dmlro', 'user'] },
    { label: 'Sanctions Registry', path: '/sanctions', icon: <Globe size={20} />, roles: ['admin', 'compliance_manager', 'dmlro', 'user'] },
    { label: 'Regulatory Reports', path: '/reports', icon: <FileText size={20} />, roles: ['admin', 'compliance_manager', 'dmlro', 'user'] },
    { label: 'Governance', path: '/admin', icon: <Settings size={20} />, roles: [], adminOnly: true },
  ];

  const filteredNavItems = navItems.filter(item => {
    const role = String(currentUser.role || '').toLowerCase();
    const isAdmin = currentUser.is_system_admin === true || role === 'admin';
    
    if (item.adminOnly) return isAdmin;
    
    // Safety: always show core navigation to valid users
    if (item.path !== '/admin') return true;
    
    return false;
  });

  useEffect(() => {
    console.log("[Layout] User Role:", currentUser.role);
    console.log("[Layout] Filtered Nav Items Count:", filteredNavItems.length);
  }, [currentUser, filteredNavItems]);

  const BrandLogo = ({ size = "h-10" }: { size?: string }) => (
    <div className={`relative flex items-center justify-center ${size}`}>
      <img 
        src={LOCAL_LOGO} 
        alt="RPME LIMITED LLC" 
        className={`${size} w-auto object-contain`} 
        onError={(e) => { 
          const target = e.currentTarget;
          if (target.src.includes('images/logo.png')) {
            target.src = PRIMARY_LOGO;
          } else if (target.src.includes('raw.githubusercontent')) {
            target.src = FALLBACK_LOGO;
          }
        }} 
      />
    </div>
  );

  const isProd = environment === SystemEnvironment.PRODUCTION;

  return (
    <div className="flex h-screen bg-[#f8fafc] text-gray-900 overflow-hidden font-sans">
      <div className={`fixed top-0 left-0 right-0 h-1 z-[100] transition-colors duration-500 ${isSafeMode ? 'bg-red-500 animate-pulse' : !isProd ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : isCloudConnected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-gray-300'}`} />

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 xl:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-100 flex flex-col transition-transform duration-300 xl:relative xl:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8">
          <BrandLogo size="h-12" />
          <div className="mt-4 text-center">
            <span className="text-[10px] font-black text-emerald-800 uppercase tracking-[0.3em]">SanctionGuard v{APP_VERSION}</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-4 px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
                  isActive 
                    ? 'bg-emerald-950 text-white shadow-xl shadow-emerald-950/20' 
                    : 'text-slate-400 hover:text-emerald-950 hover:bg-emerald-50'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-slate-50">
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            <LogOut size={18} /> Sign Out Identity
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button className="p-2 -ml-2 text-slate-400 hover:text-emerald-950 xl:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="hidden sm:flex items-center gap-3">
              <ShieldCheck className="text-emerald-500" size={20} />
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Node Status</span>
                <span className="text-[11px] font-black uppercase text-emerald-950">
                  {isCloudConnected ? 'Authoritative Master Connection' : isConnecting ? 'Synchronizing Cluster...' : 'Restricted Local Cache Mode'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {!isProd && (
              <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl text-amber-700">
                <Beaker size={14} />
                <span className="text-[9px] font-black uppercase tracking-widest">Sandbox Protocol</span>
              </div>
            )}
            
            <div className="flex items-center gap-4 border-l border-slate-100 pl-6">
              <div className="text-right">
                <p className="text-[11px] font-black uppercase text-slate-950">{currentUser.full_name}</p>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-tighter">{currentUser.role}</p>
              </div>
              <div className="h-10 w-10 bg-emerald-100 text-emerald-800 rounded-xl flex items-center justify-center font-black text-xs">
                {currentUser.full_name.charAt(0)}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {isSafeMode && (
            <div className="mb-8 p-6 bg-red-50 border border-red-100 rounded-[2rem] flex items-center justify-between gap-6 animate-in slide-in-from-top-4">
               <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                     <ShieldAlert size={24} />
                  </div>
                  <div>
                     <h4 className="text-sm font-black text-red-900 uppercase tracking-tight">Security Fallback Protocol Active</h4>
                     <p className="text-[10px] text-red-600 font-bold uppercase mt-1">Cloud registry handshake failed or structural audit mismatch detected.</p>
                  </div>
               </div>
               <div className="flex gap-3">
                  <button 
                    onClick={() => setIsDiagOpen(true)}
                    className="px-6 py-3 bg-red-100 text-red-600 rounded-xl text-[10px] font-black uppercase hover:bg-red-200 transition-all"
                  >
                    View Discrepancies
                  </button>
                  {onRetryConnection && (
                    <button 
                      onClick={onRetryConnection}
                      className="px-6 py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all flex items-center gap-2"
                    >
                      <RefreshCw size={14} /> Re-verify Node
                    </button>
                  )}
               </div>
            </div>
          )}

          <div className="max-w-7xl mx-auto pb-20">
            {children}
          </div>
        </div>

        <footer className="h-10 bg-white border-t border-slate-100 flex items-center justify-between px-8 shrink-0 text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">
           <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><Terminal size={10}/> Node Cluster: DC-04</span>
              <span className="flex items-center gap-1.5"><Activity size={10}/> Registry Pulse: {isCloudConnected ? 'Optimal' : 'Interrupted'}</span>
           </div>
           <div>© RPME Limited LLC • v{APP_VERSION} • Governance Success Point</div>
        </footer>
      </main>

      {isDiagOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95">
             <div className="bg-red-600 p-8 text-white flex justify-between items-center">
                <h3 className="text-xl font-black uppercase">Schema Audit Discrepancies</h3>
                <button onClick={() => setIsDiagOpen(false)} className="p-2 bg-white/10 rounded-full hover:bg-white/20"><X size={20}/></button>
             </div>
             <div className="p-8 space-y-6">
                <div className="bg-red-50 border border-red-100 p-6 rounded-2xl flex gap-4 text-red-700">
                   <AlertTriangle className="shrink-0" size={24} />
                   <p className="text-xs font-bold leading-relaxed">
                     The following structural mismatches were detected during the node verification sequence. Read-write access to the master registry has been throttled to prevent corruption.
                   </p>
                </div>
                <div className="space-y-3">
                   {schemaFaults.map((fault, i) => (
                     <div key={i} className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl text-[10px] font-black text-slate-600 uppercase border border-slate-100">
                        <div className="h-1.5 w-1.5 bg-red-500 rounded-full" />
                        {fault}
                     </div>
                   ))}
                </div>
                <button onClick={() => setIsDiagOpen(false)} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-black transition-all">Acknowledged</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
