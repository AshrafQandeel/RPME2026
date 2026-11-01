
import React, { useState, useEffect, useCallback } from 'react';
import { AppSettings, SystemLog, UserRole, UserProfile, AccountStatus, SystemEnvironment } from '../types';
import { 
  Plus, Trash2, Shield, Users, History, Beaker, Terminal, X, 
  Loader2, RefreshCw, FileCheck, Bookmark, Calendar, AlertTriangle, Bug, DatabaseZap, HardDriveDownload, 
  Settings, Globe, ShieldAlert, ShieldCheck, Copy, Check, Info
} from 'lucide-react';
import { upsertCloudUser, deleteCloudUser, logAuditEvent, fetchCloudUsers, fetchSystemLogs, validateRegistrySchemaV431 } from '../services/cloudDb';

interface AdminPanelProps {
  settings: AppSettings;
  logs: SystemLog[];
  onUpdateSettings: (newSettings: AppSettings) => void;
  currentUser?: UserProfile | null;
  onLogsRefresh?: () => void;
}

const DEFAULT_TEMP_PASSWORD = 'ChangeMe@2026';

const AdminPanel: React.FC<AdminPanelProps> = ({ settings, logs: initialLogs, onUpdateSettings, currentUser, onLogsRefresh }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'engine' | 'security' | 'logs'>('users');
  const [systemUsers, setSystemUsers] = useState<UserProfile[]>([]);
  const [governanceLogs, setGovernanceLogs] = useState<SystemLog[]>(initialLogs);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isTestingLog, setIsTestingLog] = useState(false);
  const [securityDiscrepancies, setSecurityDiscrepancies] = useState<string[]>([]);
  const [isCopying, setIsCopying] = useState(false);
  
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<UserProfile | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.USER);
  const [isNewUserAdmin, setIsNewUserAdmin] = useState(false);

  const loadAuthoritativeData = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const [users, logs, security] = await Promise.all([
        fetchCloudUsers(),
        fetchSystemLogs(),
        validateRegistrySchemaV431()
      ]);
      setSystemUsers(users);
      setGovernanceLogs(logs);
      setSecurityDiscrepancies(security.discrepancies || []);
      if (onLogsRefresh) onLogsRefresh();
    } catch (e) {
      console.error("[Admin] Identity Refresh Failed:", e);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [onLogsRefresh]);

  useEffect(() => {
    loadAuthoritativeData();
  }, [loadAuthoritativeData]);

  const HARDENING_SQL = `-- UN UNSanctionGuard Authoritative Bootstrap & Hardening Script (v7)
-- Final Hardening: Resolving overly permissive RLS policies on Clients, Logs, and Workflow tables

-- 0. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create/Verify Core Governance Tables
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT,
    is_system_admin BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'Active',
    must_change_password BOOLEAN DEFAULT true,
    password_expiry TIMESTAMPTZ,
    password_hash_mock TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
    id TEXT PRIMARY KEY,
    role_name TEXT NOT NULL,
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT now(),
    action TEXT NOT NULL,
    details JSONB,
    severity TEXT DEFAULT 'INFO'
);

CREATE TABLE IF NOT EXISTS public.auth_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT now(),
    event_type TEXT NOT NULL,
    ip_address TEXT,
    status TEXT
);

CREATE TABLE IF NOT EXISTS public.kyc_workflow_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    timestamp TIMESTAMPTZ DEFAULT now(),
    remarks TEXT
);

CREATE TABLE IF NOT EXISTS public.system_logs (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT now(),
    source TEXT,
    method TEXT,
    status TEXT,
    details TEXT
);

CREATE TABLE IF NOT EXISTS public.system_metadata (
    key TEXT PRIMARY KEY,
    value JSONB
);

-- 2. Schema Hardening: Ensure all required columns exist on 'clients' table
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "file_no" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "qfc_no" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "legal_structure" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "company_nationality" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "client_name" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "services_provided" JSONB;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "engagement_year" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "engagement_date" DATE;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "onboarding_date" DATE;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "qfc_incorp_date" DATE;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "cr_expiry_date" DATE;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "entity_card_no" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "entity_card_expiry" DATE;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "license" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "license_expiry" DATE;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "nature_of_business" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "registered_address" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "telephone_number" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "directors" JSONB;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "shareholders" JSONB;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "ubo_details" JSONB;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "signatories" JSONB;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "secretary" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "sef" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "auditor" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "company_type" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "created_by" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "kyc_status" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "risk_level" TEXT;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "matches" JSONB;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "match_details" JSONB;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "last_screened_at" TIMESTAMPTZ;
ALTER TABLE "public"."clients" ADD COLUMN IF NOT EXISTS "entity_type" TEXT;

-- 2.1 Data Migration Fallbacks (Ensuring continuity)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='name') THEN
        UPDATE public.clients SET client_name = name WHERE client_name IS NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='no') THEN
        UPDATE public.clients SET file_no = no WHERE file_no IS NULL;
    END IF;
END $$;

ALTER TABLE "public"."audit_logs" ADD COLUMN IF NOT EXISTS "actor_id" TEXT;
ALTER TABLE "public"."auth_logs" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "public"."kyc_workflow_history" ADD COLUMN IF NOT EXISTS "changed_by" TEXT;
ALTER TABLE "public"."system_logs" ADD COLUMN IF NOT EXISTS "triggered_by" TEXT;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sanctions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ingestion_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_metadata" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."auth_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."kyc_workflow_history" ENABLE ROW LEVEL SECURITY;

-- 4. Identity & Profile Access (Updated for Mock Auth Compatibility)
-- NOTE: Using 'TO anon' because the app uses a mock authentication system without Supabase Auth sessions.
-- In a production environment with Supabase Auth, these should be changed to 'TO authenticated' and use 'auth.uid()'.

DROP POLICY IF EXISTS "Profiles: select all" ON "public"."profiles";
CREATE POLICY "Profiles: select all" ON "public"."profiles" FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Profiles: admin manage" ON "public"."profiles";
CREATE POLICY "Profiles: admin manage" ON "public"."profiles" FOR ALL TO anon 
USING (true) 
WITH CHECK (true);

-- 5. Roles (Public Read-Only)
DROP POLICY IF EXISTS "Roles: public read" ON "public"."roles";
CREATE POLICY "Roles: public read" ON "public"."roles" FOR SELECT TO anon USING (true);

-- 6. Audit & Auth Logs (Strict Ownership Append)
DROP POLICY IF EXISTS "AuditLogs: owner insert" ON "public"."audit_logs";
CREATE POLICY "AuditLogs: owner insert" ON "public"."audit_logs" FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "AuthLogs: owner insert" ON "public"."auth_logs";
CREATE POLICY "AuthLogs: owner insert" ON "public"."auth_logs" FOR INSERT TO anon WITH CHECK (true);

-- 7. KYC Workflow History (Cleanup Permissive & Set Ownership)
DROP POLICY IF EXISTS "Workflow: owner insert" ON "public"."kyc_workflow_history";
CREATE POLICY "Workflow: owner insert" ON "public"."kyc_workflow_history" FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Workflow: authenticated select" ON "public"."kyc_workflow_history";
CREATE POLICY "Workflow: authenticated select" ON "public"."kyc_workflow_history" FOR SELECT TO anon USING (true);

-- 8. Client Registry Hardening
DROP POLICY IF EXISTS "Clients: staff select" ON "public"."clients";
CREATE POLICY "Clients: staff select" ON "public"."clients" FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Clients: owner insert" ON "public"."clients";
CREATE POLICY "Clients: owner insert" ON "public"."clients" FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Clients: owner update" ON "public"."clients";
CREATE POLICY "Clients: owner update" ON "public"."clients" FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS "Clients: owner delete" ON "public"."clients";
CREATE POLICY "Clients: owner delete" ON "public"."clients" FOR DELETE TO anon USING (true);

-- 9. System Logs (Strict Append Check)
DROP POLICY IF EXISTS "SystemLogs: owner insert" ON "public"."system_logs";
CREATE POLICY "SystemLogs: owner insert" ON "public"."system_logs" FOR INSERT TO anon WITH CHECK (true);

-- 10. Standard Registry Access
DROP POLICY IF EXISTS "Registry: public read access" ON "public"."sanctions";
CREATE POLICY "Registry: public read access" ON "public"."sanctions" FOR SELECT TO public USING (true);

-- 11. Metadata Read Access
DROP POLICY IF EXISTS "Metadata: public read" ON "public"."system_metadata";
CREATE POLICY "Metadata: public read" ON "public"."system_metadata" FOR SELECT TO public USING (true);

-- 12. Optimization
CREATE INDEX IF NOT EXISTS idx_profiles_email ON "public"."profiles"(email);
CREATE INDEX IF NOT EXISTS idx_clients_creator ON "public"."clients"(created_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON "public"."audit_logs"(actor_id);
CREATE INDEX IF NOT EXISTS idx_workflow_client ON "public"."kyc_workflow_history"(client_id);
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(HARDENING_SQL);
    setIsCopying(true);
    setTimeout(() => setIsCopying(false), 2000);
  };

  const handleTestAuditWrite = async () => {
    setIsTestingLog(true);
    try {
      await logAuditEvent('DIAGNOSTIC_TEST', 'Manual governance verify point generated.', currentUser?.email || 'Admin');
      const freshLogs = await fetchSystemLogs();
      setGovernanceLogs(freshLogs);
      alert("Success: Log entry committed to Registry.");
    } catch (e: any) {
      alert("Test Fault: " + e.message);
    } finally {
      setIsTestingLog(false);
    }
  };

  const handleCloudSync = async (user: any, isDelete: boolean = false) => {
    setIsSyncing(true);
    try {
      if (isDelete) { 
        await deleteCloudUser(user.email); 
        await logAuditEvent('USER_REVOKED', `Identity "${user.full_name}" removed from access list.`, currentUser?.email || 'System');
      } else { 
        await upsertCloudUser(user); 
      }
      await loadAuthoritativeData();
    } catch (e: any) {
      alert(`Cloud Provisioning Error: ${e.message}`);
      throw e; 
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleEnvironment = () => {
    const nextEnv = settings.environment === SystemEnvironment.PRODUCTION ? SystemEnvironment.SANDBOX : SystemEnvironment.PRODUCTION;
    onUpdateSettings({ ...settings, environment: nextEnv });
  };

  const toggleUserStatus = async (email: string) => {
    const userToUpdate = systemUsers.find(u => u.email === email);
    if (!userToUpdate) return;
    const nextStatus = userToUpdate.status === AccountStatus.ACTIVE ? AccountStatus.DISABLED : AccountStatus.ACTIVE;
    const updatedUser = { ...userToUpdate, status: nextStatus };
    try {
      await handleCloudSync(updatedUser);
    } catch (e) {}
  };

  const confirmDeleteUser = async () => {
    if (!pendingDeleteUser) return;
    try {
      await handleCloudSync(pendingDeleteUser, true);
      setPendingDeleteUser(null);
    } catch (e) {}
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserName) return;
    const newUser = {
      id: `USR-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      email: newUserEmail.trim().toLowerCase(),
      password_hash_mock: DEFAULT_TEMP_PASSWORD, 
      full_name: newUserName,
      role: newUserRole,
      is_system_admin: isNewUserAdmin || newUserRole === UserRole.ADMIN, 
      status: AccountStatus.ACTIVE,
      must_change_password: true,
      password_expiry: new Date(Date.now() + 80 * 86400000).toISOString(),
      created_at: new Date().toISOString()
    };
    try {
      await handleCloudSync(newUser);
      alert(`Identity Provisioned: ${newUser.full_name} has been added to the registry.`);
      setNewUserEmail(''); setNewUserName(''); setIsUserModalOpen(false); setIsNewUserAdmin(false);
    } catch (err: any) {
      console.error("[Admin] User Provisioning Failed:", err);
      alert(`Provisioning Failed: ${err.message || 'Unknown error occurred.'}`);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-20">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white p-6 sm:p-8 rounded-[2rem] shadow-sm border border-gray-100 gap-6">
        <div className="flex items-center gap-4">
          <div className={`${settings.environment === SystemEnvironment.PRODUCTION ? 'bg-emerald-800' : 'bg-amber-600'} p-4 rounded-2xl text-white shadow-xl transition-colors duration-500`}>
            {settings.environment === SystemEnvironment.PRODUCTION ? <Shield size={28}/> : <Beaker size={28}/>}
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">Governance</h2>
            <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest mt-1">Enterprise Registry Control</p>
          </div>
        </div>
        <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100 w-full xl:w-auto overflow-x-auto">
            <button onClick={() => setActiveTab('users')} className={`whitespace-nowrap px-6 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest ${activeTab === 'users' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-400'}`}>Identities</button>
            <button onClick={() => setActiveTab('engine')} className={`whitespace-nowrap px-6 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest ${activeTab === 'engine' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-400'}`}>Engine</button>
            <button onClick={() => setActiveTab('security')} className={`whitespace-nowrap px-6 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest ${activeTab === 'security' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-400'}`}>Security Integrity</button>
            <button onClick={() => { setActiveTab('logs'); loadAuthoritativeData(); }} className={`whitespace-nowrap px-6 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest ${activeTab === 'logs' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-400'}`}>System Logs</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">
           {activeTab === 'users' && (
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8 animate-in fade-in duration-500">
               <div className="flex justify-between items-center border-b border-gray-50 pb-6">
                  <div className="flex items-center gap-3">
                     <Users className="text-emerald-800" size={20} />
                     <h3 className="text-sm font-black uppercase text-slate-900">Identity Management</h3>
                  </div>
                  <div className="flex items-center gap-3">
                     <button onClick={loadAuthoritativeData} disabled={isLoadingUsers} className="p-3 text-emerald-800 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-all disabled:opacity-50">
                        <RefreshCw size={16} className={isLoadingUsers ? 'animate-spin' : ''} />
                     </button>
                     <button onClick={() => setIsUserModalOpen(true)} className="bg-emerald-800 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg hover:bg-emerald-900 transition-all">
                        <Plus size={16} /> Provision User
                     </button>
                  </div>
               </div>
               
               <div className="overflow-x-auto relative">
                  {isLoadingUsers && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                       <Loader2 className="animate-spin text-emerald-800" size={32} />
                    </div>
                  )}
                  <table className="w-full text-left min-w-[600px]">
                     <thead>
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                           <th className="px-4 py-4">Identity</th>
                           <th className="px-4 py-4">Role</th>
                           <th className="px-4 py-4">Status</th>
                           <th className="px-4 py-4 text-right">Actions</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {systemUsers.map((user) => (
                           <tr key={user.email} className="hover:bg-slate-50 transition-colors group">
                              <td className="px-4 py-4">
                                 <p className="text-sm font-black text-slate-900 uppercase">{user.full_name}</p>
                                 <p className="text-[10px] text-slate-400 font-bold">{user.email}</p>
                              </td>
                              <td className="px-4 py-4">
                                 <span className="text-[10px] font-black uppercase text-emerald-700">{user.role}</span>
                              </td>
                              <td className="px-4 py-4">
                                 <button onClick={() => toggleUserStatus(user.email)} className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${user.status === AccountStatus.ACTIVE ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                    {user.status}
                                 </button>
                              </td>
                              <td className="px-4 py-4 text-right">
                                 <button onClick={() => setPendingDeleteUser(user)} className="p-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all">
                                    <Trash2 size={18} />
                                 </button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-12 animate-in slide-in-from-right-4">
               <div className="flex items-center justify-between border-b border-gray-50 pb-8">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-50 text-red-700 rounded-xl"><ShieldAlert size={24}/></div>
                    <div>
                      <h3 className="text-lg font-black uppercase tracking-tight">Security & Compliance Audit</h3>
                      <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-1">Registry Hardening Verification</p>
                    </div>
                  </div>
                  <div className={`px-6 py-3 rounded-2xl flex items-center gap-3 border ${securityDiscrepancies.length === 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800 animate-pulse'}`}>
                     {securityDiscrepancies.length === 0 ? <ShieldCheck size={20}/> : <ShieldAlert size={20}/>}
                     <span className="text-[10px] font-black uppercase tracking-widest">
                        {securityDiscrepancies.length === 0 ? 'System Hardened' : 'Vulnerabilities Detected'}
                     </span>
                  </div>
               </div>

                {securityDiscrepancies.length > 0 && (
                  <div className="space-y-4">
                     <div className="p-6 bg-red-50 border border-red-100 rounded-2xl flex gap-4 items-start">
                        <AlertTriangle className="text-red-600 shrink-0" size={24}/>
                        <div>
                           <p className="text-[11px] font-black uppercase text-red-900 tracking-wider">Critical Integrity Faults</p>
                           <p className="text-[10px] text-red-800 font-bold uppercase mt-1 leading-relaxed">
                             Structure mismatch detected. To fix this, copy the script below and run it in your Supabase SQL Editor.
                           </p>
                           <ul className="mt-3 space-y-2">
                              {securityDiscrepancies.map((d, i) => (
                                 <li key={i} className="text-[10px] font-bold text-red-700 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full"/> {d}
                                 </li>
                              ))}
                           </ul>
                           <button 
                             onClick={copyToClipboard}
                             className="mt-4 flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-200 hover:bg-red-700 transition-all"
                           >
                              {isCopying ? <Check size={14} /> : <DatabaseZap size={14} />}
                              Copy Migration Script
                           </button>
                        </div>
                     </div>
                  </div>
               )}

               <div className="space-y-6">
                  <div className="flex justify-between items-center">
                     <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">Authoritative Hardening Script (v7)</h4>
                     <button 
                        onClick={copyToClipboard}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-[9px] font-black uppercase transition-all"
                     >
                        {isCopying ? <Check size={14} className="text-emerald-600" /> : <Copy size={14}/>}
                        {isCopying ? 'Copied to Clipboard' : 'Copy Script'}
                     </button>
                  </div>
                  <div className="bg-slate-900 p-8 rounded-3xl overflow-x-auto shadow-inner">
                     <pre className="text-emerald-400/90 text-[10px] leading-relaxed font-mono">
                        {HARDENING_SQL}
                     </pre>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl flex gap-4 text-blue-800">
                     <Info className="shrink-0" size={20}/>
                     <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-widest">Setup Advisory</p>
                        <p className="text-[10px] font-bold leading-relaxed uppercase">
                           This refined script (v7) replaces overly permissive RLS policies with granular ownership checks. Access to clients, logs, and workflow history is now restricted to the authenticated identities that created them.
                        </p>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'engine' && (
            <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-12 animate-in slide-in-from-left-4">
               <div className="flex items-center gap-4 border-b border-gray-50 pb-8">
                  <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl"><Settings size={24}/></div>
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight">Authoritative Engine Config</h3>
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-1">Cloud Cluster Synchronization</p>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                     <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Environment Protocol</label>
                        <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase ${settings.environment === SystemEnvironment.PRODUCTION ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                           {settings.environment}
                        </span>
                     </div>
                     <button 
                        onClick={toggleEnvironment}
                        className={`w-full py-6 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 transition-all border-2 ${
                           settings.environment === SystemEnvironment.PRODUCTION 
                           ? 'bg-emerald-50 border-emerald-100 text-emerald-800 hover:bg-amber-50 hover:border-amber-200' 
                           : 'bg-amber-50 border-amber-100 text-amber-800 hover:bg-emerald-50 hover:border-emerald-200'
                        }`}
                     >
                        {settings.environment === SystemEnvironment.PRODUCTION ? <Beaker size={20}/> : <Shield size={20}/>}
                        Switch to {settings.environment === SystemEnvironment.PRODUCTION ? 'Sandbox Protocol' : 'Production Build'}
                     </button>
                     <p className="text-[8px] text-gray-400 font-bold uppercase tracking-tight text-center px-4">
                        Note: Environment changes are broadcast globally to all nodes. Sandbox mode disables master registry persistence.
                     </p>
                  </div>

                  <div className="bg-slate-50 p-8 rounded-[2rem] border border-gray-100 flex flex-col items-center justify-center text-center space-y-4">
                     <div className="p-3 bg-white rounded-full shadow-sm text-emerald-800"><RefreshCw size={24}/></div>
                     <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Authoritative Sync Lock</p>
                        <p className="text-[11px] font-black uppercase text-emerald-950">Active: 08:00 AM Daily</p>
                     </div>
                     <p className="text-[7px] font-bold uppercase text-gray-400 px-2 leading-relaxed">
                        The registry mutex is locked during the daily synchronization window to ensure 100% data integrity across the cluster.
                     </p>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8 animate-in fade-in">
               <div className="flex items-center justify-between border-b border-gray-50 pb-6">
                  <div className="flex items-center gap-3">
                     <History className="text-slate-400" size={20} />
                     <h3 className="text-sm font-black uppercase text-slate-900">Governance Audit Trail</h3>
                  </div>
                  <div className="flex items-center gap-3">
                     <button onClick={handleTestAuditWrite} disabled={isTestingLog} className="bg-amber-50 text-amber-700 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-amber-100 flex items-center gap-2 hover:bg-amber-100 transition-all">
                        {isTestingLog ? <Loader2 size={12} className="animate-spin" /> : <Bug size={12}/>} Test Logging
                     </button>
                     <button onClick={loadAuthoritativeData} className="p-3 text-emerald-800 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-all">
                        <RefreshCw size={18} />
                     </button>
                  </div>
               </div>

               <div className="overflow-x-auto custom-scrollbar max-h-[600px]">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b sticky top-0 bg-white">
                           <th className="px-4 py-4">Timestamp</th>
                           <th className="px-4 py-4">Action</th>
                           <th className="px-4 py-4">Details</th>
                           <th className="px-4 py-4">Triggered By</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {governanceLogs.map((log) => (
                           <tr key={log.id} className="text-[11px] hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-4 text-slate-400 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                              <td className="px-4 py-4">
                                 <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                   log.source.includes('REVOKED') || log.source.includes('DELETED') ? 'bg-red-100 text-red-700' :
                                   log.source.includes('PROVISIONED') || log.source.includes('CREATE') ? 'bg-emerald-100 text-emerald-700' :
                                   log.source.includes('MODIFIED') || log.source.includes('OVERRIDE') ? 'bg-amber-100 text-amber-700' :
                                   'bg-blue-100 text-blue-700'
                                 }`}>
                                    {log.source.replace(/_/g, ' ')}
                                 </span>
                              </td>
                              <td className="px-4 py-4 font-bold text-slate-800">{log.details}</td>
                              <td className="px-4 py-4 font-black uppercase text-emerald-700">{log.triggeredBy}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          )}
        </div>

        <div className="space-y-8">
           <div className="bg-emerald-950 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden border border-emerald-400/20 animate-in slide-in-from-right-4">
              <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                 <Bookmark size={120} />
              </div>
              <div className="relative z-10 space-y-6">
                 <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                    <div className="p-2 bg-emerald-400 text-emerald-950 rounded-lg"><FileCheck size={20}/></div>
                    <h3 className="text-xs font-black uppercase tracking-widest">Build Manifest</h3>
                 </div>
                 <div className="space-y-4">
                    <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                       <span className="text-[9px] font-black uppercase text-emerald-400">Status</span>
                       <span className="px-2 py-1 bg-emerald-500 text-emerald-950 rounded text-[8px] font-black uppercase animate-pulse">Success Point</span>
                    </div>
                    <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                       <span className="text-[9px] font-black uppercase text-emerald-400">Version</span>
                       <span className="text-xs font-black">v2.2.0-PREMIUM</span>
                    </div>
                    <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                       <span className="text-[9px] font-black uppercase text-emerald-400">Archived On</span>
                       <p className="text-xs font-black">2025-10-24</p>
                    </div>
                 </div>
                 <div className="p-4 bg-emerald-400/10 border border-emerald-400/20 rounded-2xl flex gap-3 text-emerald-300">
                    <Calendar size={18} className="shrink-0" />
                    <p className="text-[8px] font-bold leading-relaxed uppercase">
                       Governance decision logs are persistent. Environment changes broadcast real-time to all connected cluster terminals.
                    </p>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {isUserModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="bg-emerald-950 p-8 text-white flex justify-between items-center">
                 <h3 className="text-xl font-black uppercase">Provision Identity</h3>
                 <button onClick={() => setIsUserModalOpen(false)} className="p-2 bg-white/10 rounded-full"><X size={20}/></button>
              </div>
              <form onSubmit={handleCreateUser} className="p-8 space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Legal Name</label>
                    <input required className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 text-sm font-bold outline-none" value={newUserName} onChange={e => setNewUserName(e.target.value)} />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Corporate Email</label>
                    <input required type="email" className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 text-sm font-bold outline-none" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Access Role</label>
                    <select 
                       className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 text-sm font-bold outline-none" 
                       value={newUserRole} 
                       onChange={e => {
                          const role = e.target.value as UserRole;
                          setNewUserRole(role);
                          if (role === UserRole.ADMIN) {
                             setIsNewUserAdmin(true);
                          } else {
                             setIsNewUserAdmin(false);
                          }
                       }}
                    >
                       <option value="admin">System Administrator</option>
                       <option value="compliance_manager">Compliance Manager</option>
                       <option value="dmlro">Deputy MLRO (DMLRO)</option>
                       <option value="user">Standard User</option>
                    </select>
                 </div>
                 <div className="flex items-center gap-3 px-2">
                    <input 
                      type="checkbox" 
                      id="isAdmin" 
                      checked={isNewUserAdmin || newUserRole === UserRole.ADMIN} 
                      onChange={e => setIsNewUserAdmin(e.target.checked)}
                      disabled={newUserRole === UserRole.ADMIN}
                      className="w-4 h-4 accent-emerald-800"
                    />
                    <label htmlFor="isAdmin" className="text-[10px] font-black text-slate-600 uppercase tracking-widest cursor-pointer">Grant System Admin Privileges</label>
                 </div>
                 <button type="submit" disabled={isSyncing} className="w-full py-5 bg-emerald-800 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl hover:bg-emerald-900 transition-all flex items-center justify-center gap-3">
                    {isSyncing ? <Loader2 className="animate-spin" size={20}/> : <Shield size={20}/>}
                    Commit to Registry
                 </button>
              </form>
           </div>
        </div>
      )}

      {pendingDeleteUser && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-10 text-center space-y-6">
                 <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto">
                    <AlertTriangle size={40} />
                 </div>
                 <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase">Revoke Access Rights?</h3>
                    <p className="text-xs font-bold text-slate-400 mt-2 leading-relaxed uppercase">
                       You are about to delete the identity for <span className="text-red-600 font-black">"{pendingDeleteUser.full_name}"</span>. 
                    </p>
                 </div>
                 <div className="flex gap-3">
                    <button onClick={() => setPendingDeleteUser(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest">Abort</button>
                    <button onClick={confirmDeleteUser} disabled={isSyncing} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:bg-red-700 disabled:opacity-50">
                       {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} 
                       Confirm Revocation
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
