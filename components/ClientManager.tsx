
import React, { useState, useEffect } from 'react';
import { Client, RiskLevel, KYCStatus, EntityType, UserRole, ScreeningProgress, PersonRecord } from '../types';
import { 
  Plus, Trash2, Eye, RefreshCw, X, CheckCircle2, Landmark, 
  FileText, Shield, Loader2, ScanSearch, Search, 
  Activity, Database, CheckCircle,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ShieldAlert,
  Info, MapPin, Mail, Globe, FileSignature, 
  History, Fingerprint, ShieldCheck, ThumbsUp, ThumbsDown,
  Clock, Edit3, AlertTriangle, Phone, Calendar, Briefcase, UserPlus, Key, FileBadge, UserCheck, User,
  FileCheck, CloudUpload, AlertCircle, Sparkles, Upload
} from 'lucide-react';
import { DocumentUploadModal } from './DocumentUploadModal';

const CLIENTS_PER_PAGE = 15;

const INITIAL_FORM_STATE: any = {
  "No": "", "Status": "Pending", "QFC No": "", "Legal Structure": "", "Company Nationality": "",
  "Client Name": "", "Services Provided": [], "Engagement Year": new Date().getFullYear().toString(), 
  "Engagement Date": "", "Onboarding Date": new Date().toISOString().split('T')[0], 
  "Date of QFC Incorporation or Registration": "", "CR Expired date": "",
  "Entity Card No": "", "Entity Card Expiry": "", "License": "", "License Expiry": "",
  "Nature of Business": "", "Registered Address": "", "Telephone Number": "", "E Mail": "",
  "Website": "", "Directors Names": [], "Significant Shareholders": [], "UBO Details": [],
  "Authorized Signatory": [], "Secretary": "", "Senior Executive Function": "",
  "Approved Auditor": "", "Company Type": "", "kyc_status": KYCStatus.DRAFT, "entity_type": EntityType.CORPORATE, "document_count": 0
};

interface FormSectionProps {
  title: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
  fullWidth?: boolean;
}

const FormSection: React.FC<FormSectionProps> = ({ title, icon, children, fullWidth = false }) => (
  <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
    <div className="flex items-center gap-4 text-emerald-800 font-black border-b border-gray-50 pb-4">
      <div className="bg-emerald-50 p-2.5 rounded-xl">{icon}</div>
      <span className="text-[10px] uppercase tracking-[0.2em]">{title}</span>
    </div>
    <div className={fullWidth ? "w-full" : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 sm:gap-6"}>{children}</div>
  </div>
);

const InputField = ({ label, value, onChange, type = "text", placeholder = "", required = false, hasError = false }: any) => (
  <div className="space-y-1.5 sm:space-y-2">
    <div className="flex justify-between">
        <label className={`text-[9px] font-black uppercase tracking-widest block ml-1 ${hasError ? 'text-red-500' : 'text-gray-400'}`}>{label}</label>
        {required && <span className={`text-[9px] font-black uppercase ${hasError ? 'text-red-600' : 'text-amber-600'}`}>Required</span>}
    </div>
    <input 
      type={type} 
      placeholder={placeholder}
      className={`w-full border-2 rounded-xl sm:rounded-2xl p-3 sm:p-4 text-sm font-bold outline-none transition-all ${
        hasError 
          ? 'bg-red-50 border-red-200 text-red-900 focus:border-red-500' 
          : 'bg-gray-50 border-transparent text-emerald-950 focus:border-emerald-800 focus:bg-white'
      }`} 
      value={value} 
      onChange={e => onChange(e.target.value)} 
      required={required} 
    />
    {hasError && <p className="text-[8px] font-black text-red-500 uppercase tracking-widest ml-1">This field is mandatory</p>}
  </div>
);

const PersonRecordManager = ({ title, records, onUpdate }: { title: string, records: PersonRecord[], onUpdate: (recs: PersonRecord[]) => void }) => {
  const addPerson = () => {
    onUpdate([...records, { name: '', qid_passport: '', nationality: '', dob: '', authority: '', percentage: 0 }]);
  };

  const removePerson = (index: number) => {
    onUpdate(records.filter((_, i) => i !== index));
  };

  const updatePerson = (index: number, field: keyof PersonRecord, value: any) => {
    const next = [...records];
    next[index] = { ...next[index], [field]: value };
    onUpdate(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b border-gray-50 pb-2">
        <label className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">{title}</label>
        <button type="button" onClick={addPerson} className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-all">
          <UserPlus size={14} />
        </button>
      </div>
      {records.length === 0 && <p className="text-[9px] text-gray-300 font-bold italic uppercase">No records provisioned</p>}
      <div className="space-y-3">
        {records.map((person, idx) => (
          <div key={idx} className="bg-gray-50/50 p-4 rounded-xl space-y-3 relative group">
            <button type="button" onClick={() => removePerson(idx)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
              <X size={14} />
            </button>
            <div className="grid grid-cols-2 gap-3">
              <input 
                placeholder="Full Name" 
                className="bg-white border rounded-lg p-2 text-[11px] font-bold outline-none" 
                value={person.name} 
                onChange={e => updatePerson(idx, 'name', e.target.value)} 
              />
              <input 
                placeholder="ID / Passport" 
                className="bg-white border rounded-lg p-2 text-[11px] font-bold outline-none" 
                value={person.qid_passport} 
                onChange={e => updatePerson(idx, 'qid_passport', e.target.value)} 
              />
              <input 
                placeholder="Nationality" 
                className="bg-white border rounded-lg p-2 text-[11px] font-bold outline-none" 
                value={person.nationality} 
                onChange={e => updatePerson(idx, 'nationality', e.target.value)} 
              />
              <input 
                type="date" 
                className="bg-white border rounded-lg p-2 text-[11px] font-bold outline-none" 
                value={person.dob} 
                onChange={e => updatePerson(idx, 'dob', e.target.value)} 
              />
              <input 
                placeholder="Authority/Role" 
                className="bg-white border rounded-lg p-2 text-[11px] font-bold outline-none" 
                value={person.authority || ''} 
                onChange={e => updatePerson(idx, 'authority', e.target.value)} 
              />
              <div className="relative">
                <input 
                  type="number"
                  placeholder="Share %" 
                  className="w-full bg-white border rounded-lg p-2 text-[11px] font-bold outline-none pr-6" 
                  value={person.percentage || ''} 
                  onChange={e => updatePerson(idx, 'percentage', parseFloat(e.target.value) || 0)} 
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-400">%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DetailRow = ({ label, value, icon }: { label: string, value: string | React.ReactNode, icon: React.ReactNode }) => (
  <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-transparent hover:border-gray-100 transition-all">
    <div className="p-2.5 bg-white rounded-xl shadow-sm text-emerald-800">{icon}</div>
    <div className="min-w-0 flex-1">
      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
      <div className="text-sm font-bold text-emerald-950 truncate">{value || <span className="text-gray-300 italic">Not Disclosed</span>}</div>
    </div>
  </div>
);

const PersonDetailList = ({ title, records }: { title: string, records: PersonRecord[] }) => (
  <div className="space-y-3">
    <h5 className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">{title}</h5>
    {records.length === 0 ? (
      <p className="text-[10px] text-gray-300 italic px-4 py-2 border border-dashed rounded-xl">No entities listed</p>
    ) : (
      <div className="grid grid-cols-1 gap-2">
        {records.map((r, i) => (
          <div key={i} className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
            <div className="min-w-0 flex-1">
               <p className="text-xs font-bold text-emerald-950 truncate">{r.name}</p>
               <p className="text-[8px] font-black text-gray-400 uppercase">{r.nationality || 'Jurisdiction N/A'} • {r.qid_passport || 'No ID'}</p>
            </div>
            <div className="text-right shrink-0 ml-4">
               {r.percentage ? <span className="text-[10px] font-black text-emerald-700">{r.percentage}%</span> : null}
               {r.authority ? <p className="text-[7px] font-black text-gray-400 uppercase mt-0.5">{r.authority}</p> : null}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

interface ClientManagerProps {
  clients: Client[];
  totalCount: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  isRefreshing: boolean;
  onAddClient: (client: Client) => Promise<void>;
  onDeleteClient: (id: string) => Promise<void>;
  onUpdateClient: (client: Client) => Promise<void>;
  onRefresh: () => void;
  onSearch?: (term: string) => void;
  onReScreen?: () => void;
  onAdvancedScreening?: (client: Client) => Promise<Client>;
  screeningProgress?: ScreeningProgress;
  currentUserRole: UserRole;
  currentUserId: string;
}

const ClientManager: React.FC<ClientManagerProps> = ({ 
  clients, 
  totalCount,
  currentPage,
  onPageChange,
  isRefreshing,
  onAddClient, 
  onDeleteClient, 
  onUpdateClient,
  onRefresh, 
  onSearch,
  onReScreen,
  onAdvancedScreening,
  screeningProgress,
  currentUserRole, 
  currentUserId 
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    if (!onSearch) return;
    const t = setTimeout(() => onSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanningAdvanced, setIsScanningAdvanced] = useState(false);
  const [advancedScreenError, setAdvancedScreenError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [pendingDeleteClient, setPendingDeleteClient] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [clientForDocuments, setClientForDocuments] = useState<Client | null>(null);
  const [showDocWarning, setShowDocWarning] = useState(false);
  const [pendingCommitClient, setPendingCommitClient] = useState<Client | null>(null);

  const totalPages = Math.ceil(totalCount / CLIENTS_PER_PAGE);
  const [formData, setFormData] = useState({ ...INITIAL_FORM_STATE });

  const userRole = String(currentUserRole || '').toLowerCase();
  const isComplianceManager = userRole.includes('admin') || userRole.includes('compliance') || userRole.includes('dmlro');
  const isReviewerOrAdmin = isComplianceManager;
  const isDataEntry = userRole.includes('user');
  const isPrivileged = isComplianceManager || isDataEntry;
  const canApproveReject = isReviewerOrAdmin;

  const handleStatusChange = async (status: KYCStatus) => {
    if (!selectedClient) return;
    const updated = { ...selectedClient, kyc_status: status };
    // UI feedback immediate
    setSelectedClient(updated);
  };

  const handleAdvancedScreen = async () => {
    if (!selectedClient || !onAdvancedScreening || isScanningAdvanced) return;
    setIsScanningAdvanced(true);
    setAdvancedScreenError(null);
    try {
      console.log("[ClientManager] Initiating Advanced Screening for client ID:", selectedClient.id);
      const updated = await onAdvancedScreening(selectedClient);
      console.log("[ClientManager] Advanced Screening completed. Resulting Client:", updated);
      if (updated) {
        setSelectedClient(updated);
      } else {
        console.warn("[ClientManager] onAdvancedScreening returned null or undefined.");
      }
    } catch (err: any) {
      console.error("[ClientManager] handleAdvancedScreen caught error:", err);
      setAdvancedScreenError(err.message || "An unexpected error occurred during AI analysis.");
    } finally {
      setIsScanningAdvanced(false);
    }
  };

  const handleDossierCommit = async () => {
    if (!selectedClient || isSubmitting) return;

    // Document warning logic
    if (!selectedClient.document_count && !showDocWarning) {
      setPendingCommitClient(selectedClient);
      setShowDocWarning(true);
      return;
    }

    setIsSubmitting(true);
    try {
      // Ensure we await the update protocol in the parent App component
      await onUpdateClient(selectedClient);
      setSelectedClient(null); // Success: Close modal
      setShowDocWarning(false);
      setPendingCommitClient(null);
    } catch (err: any) {
      console.error("[Registry] Update Fault:", err);
      alert("Registry Sync Failure: " + (err.message || "Unknown error during cloud commit. Ensure registry is online."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmedCommit = async () => {
    if (pendingCommitClient) {
      // Commit selected client update
      setIsSubmitting(true);
      try {
        await onUpdateClient(pendingCommitClient);
        setSelectedClient(null);
        setShowDocWarning(false);
        setPendingCommitClient(null);
      } catch (err: any) {
        alert("Commit Failed: " + err.message);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Commit new entity creation
      setShowDocWarning(false);
      handleSubmit();
    }
  };

  const openProvisionModal = () => {
    setEditMode(false);
    // Generate the final ID for the new entity immediately to support document folder consistency
    const finalId = `RPME-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    setFormData({ ...INITIAL_FORM_STATE, id: finalId });
    setFormErrors([]);
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditMode(true);
    setFormData({ ...client });
    setFormErrors([]);
    setIsModalOpen(true);
    setSelectedClient(null); // Close dossier if open
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    // Check for documents if committing
    if (!editMode && !formData.document_count && !showDocWarning) {
      setShowDocWarning(true);
      return;
    }

    setSubmissionError(null);
    const errors: string[] = [];
    if (!formData["Client Name"]) errors.push("Client Name");
    if (!formData["No"]) errors.push("No");
    if (!formData["Company Nationality"]) errors.push("Company Nationality");

    setFormErrors(errors);
    if (errors.length > 0) return;

    setIsSubmitting(true);
    try {
      if (editMode) {
        await onUpdateClient(formData as Client);
      } else {
        const initialStatus = isDataEntry ? KYCStatus.PENDING_REVIEW : KYCStatus.DRAFT;
        const newClient: Client = { 
          ...formData, 
          created_at: new Date().toISOString(), 
          created_by: currentUserId, 
          kyc_status: initialStatus,
          riskLevel: RiskLevel.NONE, 
          entity_type: EntityType.CORPORATE 
        };
        await onAddClient(newClient);
      }
      
      setFormData({ ...INITIAL_FORM_STATE });
      setFormErrors([]);
      setSubmissionError(null);
      setIsModalOpen(false);
    } catch (err: any) { 
      console.error("[Persistence Error]", err);
      setSubmissionError(err.message || "Conflict or communication error during record provisioning.");
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const handleConfirmDelete = async () => {
    if (pendingDeleteClient && !isDeleting) {
      setIsDeleting(true);
      try {
        await onDeleteClient(pendingDeleteClient.id);
        setPendingDeleteClient(null);
      } catch (err: any) {
        alert("Deletion Failed: " + (err.message || "Communication fault."));
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 relative">
      
      {screeningProgress && screeningProgress.status !== 'Not Started' && (
        <div className="bg-emerald-950 p-6 sm:p-8 rounded-[2rem] text-white shadow-2xl animate-in slide-in-from-top-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
             <Activity size={100} />
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-2xl animate-pulse">
                {screeningProgress.status === 'Completed' ? <CheckCircle className="text-emerald-400" size={24}/> : <ScanSearch className="text-amber-400" size={24}/>}
              </div>
              <div>
                <h4 className="text-lg font-black uppercase tracking-tight">
                  {screeningProgress.status === 'Completed' ? 'Batch Authoritative Screening Finalized' : 'Global Screening In Progress'}
                </h4>
                <p className="text-[10px] text-white/50 font-black uppercase tracking-widest mt-1">
                   Authority: Sanctions Master Table (Auth-Consensus)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 w-full sm:w-auto">
               <div className="flex flex-col items-end">
                  <p className="text-[9px] font-black text-white/30 uppercase">Screened / Total</p>
                  <p className="text-sm font-black text-emerald-400">{screeningProgress.screenedRecords.toLocaleString()} / {screeningProgress.totalRecords.toLocaleString()}</p>
               </div>
               <div className="flex-1 sm:w-48 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-400 transition-all duration-500" 
                    style={{ width: `${(screeningProgress.screenedRecords / screeningProgress.totalRecords) * 100}%` }}
                  />
               </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-gray-100 shadow-sm relative z-10 gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-emerald-950 tracking-tighter uppercase">Corporate Registry</h2>
          <p className="text-[10px] text-emerald-700 mt-1 uppercase tracking-[0.4em] font-black">Database-Authoritative Hub</p>
        </div>
        <div className="flex w-full sm:w-auto gap-3">
          <button 
            onClick={onReScreen} 
            disabled={isRefreshing || (screeningProgress?.status === 'In Progress')} 
            className="flex items-center gap-2 px-6 py-4 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-100 transition-all disabled:opacity-50"
          >
             <Database size={18} /> Global DB Screen
          </button>
          <button onClick={onRefresh} disabled={isRefreshing} className="p-4 text-gray-400 hover:text-emerald-800 bg-gray-50 rounded-xl transition-all shrink-0">
            <RefreshCw size={24} className={isRefreshing ? 'animate-spin' : ''}/>
          </button>
          {isPrivileged && (
            <button 
              type="button" 
              onClick={(e) => { e.stopPropagation(); openProvisionModal(); }} 
              className="flex-1 sm:flex-none bg-emerald-800 text-white px-6 sm:px-8 py-4 rounded-xl sm:rounded-2xl font-black text-[10px] uppercase tracking-widest flex justify-center items-center gap-2 shadow-xl hover:bg-emerald-900 transition-all"
            >
              <Plus size={18} /> Provision Entity
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" />
        <input
          type="text"
          placeholder="Search by company, director, UBO, shareholder or signatory name..."
          className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-gray-100 shadow-sm text-sm font-bold outline-none focus:border-emerald-300"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-2xl sm:rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden relative z-0 flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left min-w-[1000px]">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 sm:px-10 py-5 sm:py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Entity Name</th>
                <th className="px-6 sm:px-10 py-5 sm:py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Compliance Workflow</th>
                <th className="px-6 sm:px-10 py-5 sm:py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Risk Index</th>
                <th className="px-6 sm:px-10 py-5 sm:py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Documents</th>
                <th className="px-6 sm:px-10 py-5 sm:py-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map(client => (
                <tr key={client.id} className={`hover:bg-emerald-50/20 cursor-pointer transition-colors group ${!client.document_count ? 'bg-red-50/20' : ''}`} onClick={() => setSelectedClient(client)}>
                  <td className="px-6 sm:px-10 py-5 sm:py-6">
                    <div className="font-black text-emerald-950 text-sm tracking-tight flex items-center gap-2">
                      {client["Client Name"]}
                      {!client.document_count && (
                        <span className="bg-red-100 text-red-600 p-1 rounded-full" title="Documents Missing">
                          <AlertCircle size={12} />
                        </span>
                      )}
                    </div>
                    <div className="text-[8px] text-gray-400 font-bold uppercase mt-1">Ref: {client["No"]} • {client["Legal Structure"] || 'Corporate'}</div>
                  </td>
                  <td className="px-6 sm:px-10 py-5 sm:py-6">
                    <div className="flex flex-col gap-1">
                       <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[8px] font-black uppercase border ${
                         client.kyc_status === KYCStatus.APPROVED ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                         client.kyc_status === KYCStatus.PENDING_REVIEW ? 'bg-amber-50 text-amber-700 border-amber-100' :
                         client.kyc_status === KYCStatus.UNDER_INVESTIGATION ? 'bg-orange-50 text-orange-700 border-orange-100' :
                         client.kyc_status === KYCStatus.REJECTED ? 'bg-red-50 text-red-600 border-red-100' :
                         'bg-slate-50 text-slate-400 border-slate-200'
                       }`}>
                          {client.kyc_status === KYCStatus.APPROVED ? <ShieldCheck size={10}/> : <Clock size={10}/>}
                          {client.kyc_status}
                       </span>
                    </div>
                  </td>
                  <td className="px-6 sm:px-10 py-5 sm:py-6">
                    <div className="flex items-center gap-2">
                       <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase border-2 flex items-center gap-1.5 ${
                         client.riskLevel === RiskLevel.HIGH ? 'bg-red-500 text-white border-red-600' :
                         'bg-gray-100 text-gray-400 border-gray-200'
                       }`}>
                         {client.riskLevel === RiskLevel.HIGH ? <ShieldAlert size={10} /> : <CheckCircle size={10} />}
                         {client.riskLevel === RiskLevel.HIGH ? 'HIGH RISK' : 'CLEAR'}
                       </span>
                    </div>
                  </td>
                  <td className="px-6 sm:px-10 py-5 sm:py-6">
                    <div className="flex items-center gap-2">
                       {client.document_count ? (
                         <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                           <FileCheck size={12} />
                           <span className="text-[9px] font-black">{client.document_count} FILES</span>
                         </div>
                       ) : (
                         <div className="flex items-center gap-1.5 text-red-500 bg-red-50 px-2 py-1 rounded-md border border-red-100">
                           <AlertCircle size={12} />
                           <span className="text-[9px] font-black uppercase tracking-tighter">MISSING</span>
                         </div>
                       )}
                       <button 
                         onClick={(e) => { e.stopPropagation(); setClientForDocuments(client); setIsDocumentModalOpen(true); }}
                         className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                         title="Upload / View Documents"
                       >
                         <CloudUpload size={16} />
                       </button>
                    </div>
                  </td>
                  <td className="px-6 sm:px-10 py-5 sm:py-6 text-right">
                    <div className="flex justify-end items-center gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedClient(client); }}
                        className="p-3 text-emerald-800 bg-gray-50 rounded-xl sm:opacity-0 group-hover:opacity-100 transition-all hover:bg-emerald-100"
                      >
                        <Eye size={18}/>
                      </button>
                      {(isComplianceManager || (isDataEntry && client.created_by === currentUserId)) && (
                        <>
                           <button 
                              onClick={(e) => { e.stopPropagation(); openEditModal(client); }}
                              className="p-3 text-amber-600 bg-amber-50 rounded-xl sm:opacity-0 group-hover:opacity-100 transition-all hover:bg-amber-100"
                            >
                              <Edit3 size={18}/>
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setPendingDeleteClient(client); }}
                              className="p-3 text-red-600 bg-red-50 rounded-xl sm:opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100"
                            >
                              <Trash2 size={18}/>
                            </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalCount > 0 && (
          <div className="px-6 sm:px-10 py-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-6 bg-gray-50/30 relative">
            {isRefreshing && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10 font-black text-[10px] uppercase tracking-widest text-emerald-800 gap-3">
                 <Loader2 size={16} className="animate-spin" /> Synchronizing Registry Tier...
              </div>
            )}
            
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">
               Tier <span className="text-emerald-950">{currentPage}</span> of {totalPages} • {totalCount.toLocaleString()} Entities
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={() => onPageChange(1)} disabled={currentPage === 1 || isRefreshing} className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-emerald-50 disabled:opacity-30 text-emerald-800 transition-all shadow-sm"><ChevronsLeft size={18} /></button>
              <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1 || isRefreshing} className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-emerald-50 disabled:opacity-30 text-emerald-800 transition-all shadow-sm"><ChevronLeft size={18} /></button>
              <div className="px-6 py-3 text-[10px] font-black text-emerald-950 bg-white rounded-xl border border-gray-200 shadow-sm min-w-[40px] text-center uppercase tracking-widest">{currentPage}</div>
              <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages || isRefreshing} className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-emerald-50 disabled:opacity-30 text-emerald-800 transition-all shadow-sm"><ChevronRight size={18} /></button>
              <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages || isRefreshing} className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-emerald-50 disabled:opacity-30 text-emerald-800 transition-all shadow-sm"><ChevronsRight size={18} /></button>
            </div>
          </div>
        )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {pendingDeleteClient && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2.5rem] w-full max-md shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-10 text-center space-y-6">
                 <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto">
                    <AlertTriangle size={40} />
                 </div>
                 <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase">Revoke Registry Entry?</h3>
                    <p className="text-xs font-bold text-slate-400 mt-2 leading-relaxed uppercase">
                       You are about to delete <span className="text-red-600 font-black">"{pendingDeleteClient["Client Name"]}"</span>. 
                       This action is permanent and will be logged in the governance audit trail.
                    </p>
                 </div>
                 <div className="flex gap-3">
                    <button onClick={() => setPendingDeleteClient(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest">Abort</button>
                    <button onClick={handleConfirmDelete} disabled={isDeleting} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
                       {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} 
                       Confirm Revocation
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* DOCUMENT WARNING MODAL */}
      {showDocWarning && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
           <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-10 text-center space-y-6">
                 <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto">
                    <CloudUpload size={40} />
                 </div>
                 <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Documents Missing</h3>
                    <p className="text-xs font-bold text-slate-400 mt-2 leading-relaxed uppercase">
                       This entity has no supporting documents. Do you want to continue and commit without documents, or upload them now?
                    </p>
                 </div>
                 <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => { 
                        const targetClient = pendingCommitClient || formData as Client;
                        setClientForDocuments(targetClient); 
                        setIsDocumentModalOpen(true);
                        setShowDocWarning(false); 
                      }} 
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                    >
                      <Upload size={16} /> Upload Documents
                    </button>
                    <button onClick={handleConfirmedCommit} className="w-full py-4 bg-emerald-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
                       <CheckCircle size={16} /> Confirm & Commit
                    </button>
                    <button onClick={() => { setShowDocWarning(false); setPendingCommitClient(null); }} className="w-full py-4 bg-gray-100 text-gray-500 rounded-2xl font-black text-[10px] uppercase tracking-widest">
                       Cancel
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* DOCUMENT MANAGER MODAL */}
      {isDocumentModalOpen && clientForDocuments && (
        <DocumentUploadModal 
          isOpen={isDocumentModalOpen}
          onClose={() => { setIsDocumentModalOpen(false); setClientForDocuments(null); }}
          client={clientForDocuments}
          onUpdateClient={(updated) => {
            onUpdateClient(updated);
            if (selectedClient && selectedClient.id === updated.id) {
              setSelectedClient(updated);
            }
            if (pendingCommitClient && pendingCommitClient.id === updated.id) {
              setPendingCommitClient(updated);
            }
            if (formData && formData.id === updated.id) {
              setFormData(updated);
            }
          }}
        />
      )}

      {/* CLIENT DOSSIER MODAL */}
      {selectedClient && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="bg-white rounded-[2.5rem] sm:rounded-[3.5rem] w-full max-w-5xl h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
            <div className={`p-8 sm:p-12 text-white relative overflow-hidden shrink-0 ${selectedClient.riskLevel === RiskLevel.HIGH ? 'bg-red-900' : 'bg-emerald-900'}`}>
               <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                  <Fingerprint size={160} />
               </div>
               
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 relative z-10">
                  <div className="space-y-4">
                     <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-white/10 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] border border-white/20">
                           {selectedClient.kyc_status}
                        </span>
                        {(isComplianceManager || (isDataEntry && selectedClient.created_by === currentUserId)) && (
                          <button onClick={() => openEditModal(selectedClient)} className="flex items-center gap-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] transition-all">
                             <Edit3 size={12}/> Edit Data
                          </button>
                        )}
                     </div>
                     <h2 className="text-3xl sm:text-4xl font-black tracking-tight uppercase leading-none">
                        {selectedClient["Client Name"]}
                     </h2>
                  </div>
                  <button onClick={() => setSelectedClient(null)} className="p-4 bg-white/10 hover:bg-white/20 rounded-full transition-all"><X size={24} /></button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 sm:p-12 space-y-12 custom-scrollbar bg-gray-50/30">
               
               {advancedScreenError && (
                  <div className="bg-red-50 border border-red-200 p-6 rounded-[2rem] flex items-start gap-4 animate-in fade-in slide-in-from-top-4">
                     <div className="bg-red-100 p-3 rounded-2xl text-red-600">
                        <AlertTriangle size={24} />
                     </div>
                     <div className="flex-1 space-y-1">
                        <h4 className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em]">Advanced Screening Exception</h4>
                        <p className="text-sm font-bold text-red-900 leading-snug">{advancedScreenError}</p>
                        <p className="text-[9px] font-bold text-red-500/70 uppercase mt-2">The system will maintain existing algorithmic screening results as a fallback.</p>
                     </div>
                     <button onClick={() => setAdvancedScreenError(null)} className="p-2 hover:bg-red-100 rounded-xl transition-all text-red-400 hover:text-red-600">
                        <X size={20} />
                     </button>
                  </div>
               )}

               {/* ENHANCED SCREENING RESULT SECTION */}
               <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                  <div className="bg-slate-50 p-6 border-b border-gray-100 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-900 text-white rounded-lg">
                           <ScanSearch size={18} />
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Advanced Match Intelligence</h3>
                     </div>
                     <div className="flex items-center gap-3">
                        <button 
                           onClick={handleAdvancedScreen} 
                           disabled={isScanningAdvanced}
                           className="px-4 py-2 bg-emerald-800 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-900 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                           {isScanningAdvanced ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                           Run Deep AI Scan
                        </button>
                        {selectedClient.match_details ? (
                          <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase border ${
                             selectedClient.riskLevel === RiskLevel.HIGH ? 'bg-red-500 text-white border-red-600 shadow-lg shadow-red-200' :
                             selectedClient.riskLevel === RiskLevel.MEDIUM ? 'bg-amber-100 text-amber-700 border-amber-200' :
                             'bg-emerald-100 text-emerald-700 border-emerald-200'
                          }`}>
                             {selectedClient.riskLevel} Similarity Detected
                          </span>
                        ) : (
                          <span className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase border bg-slate-100 text-slate-500 border-slate-200">
                             Clear Profile
                          </span>
                        )}
                     </div>
                  </div>
                  
                  {selectedClient.match_details ? (
                    <div className="p-8 space-y-8">
                       {/* Composite Progress Indicator */}
                       <div className="flex flex-col md:flex-row items-center gap-8 bg-gray-50/50 p-8 rounded-[2rem]">
                           <div className="shrink-0 relative">
                              <svg className="w-32 h-32 transform -rotate-90">
                                 <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-gray-200" />
                                 <circle 
                                    cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" 
                                    strokeDasharray={Math.PI * 2 * 58}
                                    strokeDashoffset={Math.PI * 2 * 58 * (1 - (selectedClient.match_details.score / 100))}
                                    className={`transition-all duration-1000 ${
                                       selectedClient.match_details.score > 75 ? 'text-red-500' : 
                                       selectedClient.match_details.score > 40 ? 'text-amber-500' : 'text-emerald-500'
                                    }`}
                                 />
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                 <span className="text-2xl font-black text-slate-900">{Math.round(selectedClient.match_details.score)}%</span>
                                 <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Weighted</span>
                              </div>
                           </div>
                           
                           <div className="flex-1 space-y-4">
                              <div className="flex items-center gap-3">
                                 <AlertTriangle size={20} className={selectedClient.match_details.score > 50 ? 'text-red-500' : 'text-amber-500'} />
                                 <h4 className="text-base font-black text-slate-900 uppercase tracking-tight">
                                    {selectedClient.match_details.detailed_report?.overall_result || selectedClient.match_details.matchedFields[0]}
                                 </h4>
                              </div>
                              <p className="text-[10px] font-bold text-slate-500 leading-relaxed uppercase">
                                 {selectedClient.match_details.detailed_report?.screener_notes || 
                                  `System has identified a correlation with a record in the global sanctions registry. Primary reason: ${selectedClient.match_details.matchedFields.join(', ')}.`}
                              </p>
                              {selectedClient.match_details.detailed_report && (
                                 <div className="text-[9px] font-black text-emerald-800 uppercase tracking-widest bg-emerald-50 px-3 py-1.5 rounded-lg inline-block">
                                    Recommended Action: {selectedClient.match_details.detailed_report.overall_recommended_action}
                                 </div>
                              )}
                           </div>
                        </div>

                        {/* Weighted Components Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                           {[
                              { label: 'Name (40%)', val: selectedClient.match_details.detailed_report?.watchlist_matches?.[0]?.scores?.name_match || (selectedClient.match_details.score > 70 ? 0.8 : 0.3), color: 'text-blue-600' },
                              { label: 'Country (20%)', val: selectedClient.match_details.detailed_report?.watchlist_matches?.[0]?.scores?.country_match || (selectedClient.match_details.matchedRecord?.nationality === selectedClient["Company Nationality"] ? 1.0 : 0), color: 'text-emerald-600' },
                              { label: 'Passport/ID (25%)', val: selectedClient.match_details.detailed_report?.watchlist_matches?.[0]?.scores?.id_match || 0, color: 'text-purple-600' },
                              { label: 'DOB (10%)', val: selectedClient.match_details.detailed_report?.watchlist_matches?.[0]?.scores?.dob_match || 0, color: 'text-orange-600' },
                              { label: 'CRN (5%)', val: selectedClient.match_details.detailed_report?.watchlist_matches?.[0]?.scores?.crn_match || 0, color: 'text-slate-600' }
                           ].map((stat, i) => (
                              <div key={i} className="bg-white border border-gray-100 p-4 rounded-2xl flex flex-col items-center text-center">
                                 <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2">{stat.label}</p>
                                 <div className={`text-sm font-black ${stat.color}`}>{Math.round((stat.val || 0) * 100)}%</div>
                                 <div className="w-full bg-gray-50 h-1 rounded-full mt-2 overflow-hidden">
                                    <div className={`h-full ${stat.color.replace('text', 'bg')}`} style={{ width: `${(stat.val || 0) * 100}%` }} />
                                 </div>
                              </div>
                           ))}
                        </div>

                        {/* Detailed rationale from Gemini if available */}
                        {selectedClient.match_details.detailed_report?.watchlist_matches?.[0]?.match_rationale && (
                           <div className="bg-slate-50 rounded-[1.5rem] p-6 space-y-4">
                              <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Match Rationale Detail</h5>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                 <div className="flex gap-3">
                                    <div className="w-1 bg-emerald-500 rounded-full" />
                                    <div>
                                       <p className="text-[8px] font-black text-slate-400 uppercase">Name Technique</p>
                                       <p className="text-[10px] font-bold text-slate-800">{selectedClient.match_details.detailed_report.watchlist_matches[0].match_rationale.name_technique}</p>
                                    </div>
                                 </div>
                                 <div className="flex gap-3">
                                    <div className="w-1 bg-blue-500 rounded-full" />
                                    <div>
                                       <p className="text-[8px] font-black text-slate-400 uppercase">Country Note</p>
                                       <p className="text-[10px] font-bold text-slate-800">{selectedClient.match_details.detailed_report.watchlist_matches[0].match_rationale.country_note}</p>
                                    </div>
                                 </div>
                                 <div className="flex gap-3">
                                    <div className="w-1 bg-purple-500 rounded-full" />
                                    <div>
                                       <p className="text-[8px] font-black text-slate-400 uppercase">ID Integrity</p>
                                       <p className="text-[10px] font-bold text-slate-800">{selectedClient.match_details.detailed_report.watchlist_matches[0].match_rationale.id_note}</p>
                                    </div>
                                 </div>
                                 <div className="flex gap-3">
                                    <div className="w-1 bg-orange-500 rounded-full" />
                                    <div>
                                       <p className="text-[8px] font-black text-slate-400 uppercase">Temporal (DOB) Note</p>
                                       <p className="text-[10px] font-bold text-slate-800">{selectedClient.match_details.detailed_report.watchlist_matches[0].match_rationale.dob_note}</p>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        )}

                        {selectedClient.match_details.matchedRecord && (
                           <div className="border-t border-gray-100 pt-8 mt-8">
                              <h5 className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">Matched Registry Identity</h5>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                 <div className="p-5 bg-white border border-gray-100 rounded-2xl">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">FullName (Registry)</p>
                                    <p className="text-xs font-black text-slate-900">
                                       {selectedClient.match_details.matchedRecord.firstName} {selectedClient.match_details.matchedRecord.lastName}
                                    </p>
                                 </div>
                                 <div className="p-5 bg-white border border-gray-100 rounded-2xl">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Source / Registry</p>
                                    <p className="text-xs font-black text-slate-900">{selectedClient.match_details.matchedRecord.source}</p>
                                 </div>
                                 <div className="p-5 bg-white border border-gray-100 rounded-2xl">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nationality / DOB</p>
                                    <p className="text-xs font-black text-slate-900">
                                       {selectedClient.match_details.matchedRecord.nationality} • {selectedClient.match_details.matchedRecord.dateOfBirth || 'N/A'}
                                    </p>
                                 </div>
                              </div>
                              <div className="mt-3 p-5 bg-red-50/30 border border-red-50 rounded-2xl">
                                 <p className="text-[8px] font-black text-red-400 uppercase tracking-widest mb-1">Registry Comments & Aliases</p>
                                 <p className="text-[10px] font-bold text-red-900 leading-relaxed mb-3">
                                    {selectedClient.match_details.matchedRecord.comments || 'No specific entity markers provided in registry.'}
                                 </p>
                                 {selectedClient.match_details.matchedRecord.aliases && selectedClient.match_details.matchedRecord.aliases.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-3 border-t border-red-100">
                                       {selectedClient.match_details.matchedRecord.aliases.map((alias, i) => (
                                          <span key={i} className="px-2 py-0.5 bg-red-100/50 text-red-700 rounded text-[8px] font-black uppercase tracking-wider">{alias}</span>
                                       ))}
                                    </div>
                                 )}
                              </div>
                           </div>
                        )}
                    </div>
                  ) : (
                    <div className="p-16 text-center space-y-6">
                       <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-sm ${selectedClient.lastScreenedAt ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {selectedClient.lastScreenedAt ? <ShieldCheck size={40} /> : <CheckCircle2 size={40} />}
                       </div>
                       <div className="max-w-md mx-auto space-y-2">
                          <h4 className="text-xl font-black text-slate-900 uppercase">
                             {selectedClient.lastScreenedAt ? 'Security Verified' : 'Algorithmic Clear'}
                          </h4>
                          <p className="text-xs font-bold text-slate-400 uppercase leading-relaxed">
                             {selectedClient.lastScreenedAt 
                               ? 'This entity has been verified against our AI intelligence engine and the global sanctions registry. No threats detected.' 
                               : 'No exact or fuzzy matches were detected in the primary sanctions registry. You can still run an Advanced AI Scan to perform heuristic and semantic verification.'}
                          </p>
                       </div>
                    </div>
                  )}
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className={`p-8 rounded-[2rem] border shadow-sm ${
                    selectedClient.riskLevel === RiskLevel.HIGH ? 'bg-red-50 border-red-100' : 
                    selectedClient.kyc_status === KYCStatus.UNDER_INVESTIGATION ? 'bg-orange-50 border-orange-100' :
                    'bg-emerald-50 border-emerald-100'
                  }`}>
                     <div className="flex items-center gap-3 mb-4">
                        <Shield className={selectedClient.riskLevel === RiskLevel.HIGH ? 'text-red-600' : (selectedClient.kyc_status === KYCStatus.UNDER_INVESTIGATION ? 'text-orange-600' : 'text-emerald-600')} size={24}/>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500">Compliance Status</h4>
                     </div>
                     <p className={`text-2xl font-black uppercase ${
                        selectedClient.riskLevel === RiskLevel.HIGH ? 'text-red-900' : 
                        selectedClient.kyc_status === KYCStatus.UNDER_INVESTIGATION ? 'text-orange-900' :
                        'text-emerald-900'
                     }`}>
                        {selectedClient.riskLevel === RiskLevel.HIGH ? 'HIGH RISK' : selectedClient.kyc_status}
                     </p>
                  </div>
                  
                  <div className="p-8 rounded-[2rem] border border-gray-100 bg-white shadow-sm md:col-span-2 flex items-center justify-between">
                     <div className="space-y-4">
                        <div className="flex items-center gap-3">
                           <History className="text-gray-400" size={24}/>
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500">Registry Footprint</h4>
                        </div>
                        <p className="text-xs font-bold text-emerald-950">Provisioned: {new Date(selectedClient.created_at).toLocaleDateString()} by {selectedClient.created_by || 'System'}</p>
                     </div>
                     
                     {canApproveReject && (
                        <div className="flex gap-2">
                           {selectedClient.kyc_status !== KYCStatus.REJECTED && (
                              <button onClick={() => handleStatusChange(KYCStatus.REJECTED)} className="px-5 py-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-all border border-red-100 flex flex-col items-center justify-center gap-1 group">
                                <ThumbsDown size={20} className="group-hover:scale-110 transition-transform"/> <span className="text-[8px] font-black uppercase">Reject</span>
                              </button>
                           )}
                           {selectedClient.kyc_status !== KYCStatus.UNDER_INVESTIGATION && (
                              <button onClick={() => handleStatusChange(KYCStatus.UNDER_INVESTIGATION)} className="px-5 py-4 bg-orange-50 text-orange-600 rounded-2xl hover:bg-orange-100 transition-all border border-orange-100 flex flex-col items-center justify-center gap-1 group">
                                <Eye size={20} className="group-hover:scale-110 transition-transform"/> <span className="text-[8px] font-black uppercase text-center leading-none">Investigation</span>
                              </button>
                           )}
                           {selectedClient.kyc_status !== KYCStatus.APPROVED && (
                              <button onClick={() => handleStatusChange(KYCStatus.APPROVED)} className="px-8 py-4 bg-emerald-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-3 hover:bg-emerald-900 transition-all group">
                                <ThumbsUp size={18} className="group-hover:rotate-12 transition-transform"/> Approve Protocol
                              </button>
                           )}
                        </div>
                     )}
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-6">
                     <h4 className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-emerald-900 border-b border-gray-100 pb-4">
                        <Info size={16}/> Identity & Jurisdiction
                     </h4>
                     <div className="grid grid-cols-1 gap-3">
                        <DetailRow label="Entity Legal Name" value={selectedClient["Client Name"]} icon={<Fingerprint size={16}/>} />
                        <DetailRow label="File Reference No" value={selectedClient["No"]} icon={<FileText size={16}/>} />
                        <DetailRow label="Jurisdiction" value={selectedClient["Company Nationality"]} icon={<Globe size={16}/>} />
                        <DetailRow label="Legal Structure" value={selectedClient["Legal Structure"]} icon={<Landmark size={16}/>} />
                        <DetailRow label="QFC No" value={selectedClient["QFC No"]} icon={<Key size={16}/>} />
                        <DetailRow label="Company Type" value={selectedClient["Company Type"]} icon={<Shield size={16}/>} />
                     </div>
                  </div>
                  
                  <div className="space-y-6">
                     <h4 className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-emerald-900 border-b border-gray-100 pb-4">
                        <MapPin size={16}/> Contact & Address
                     </h4>
                     <div className="grid grid-cols-1 gap-3">
                        <DetailRow label="Registered Address" value={selectedClient["Registered Address"]} icon={<MapPin size={16}/>} />
                        <DetailRow label="Corporate Email" value={selectedClient["E Mail"]} icon={<Mail size={16}/>} />
                        <DetailRow label="Telephone" value={selectedClient["Telephone Number"]} icon={<Phone size={16}/>} />
                        <DetailRow label="Website" value={selectedClient["Website"]} icon={<Globe size={16}/>} />
                     </div>
                  </div>
               </div>

               <div className="space-y-6">
                  <h4 className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-emerald-900 border-b border-gray-100 pb-4">
                     <UserCheck size={16}/> Governance & Compliance Registry
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                     <DetailRow label="Company Secretary" value={selectedClient["Secretary"]} icon={<Briefcase size={16}/>} />
                     <DetailRow label="Senior Executive" value={selectedClient["Senior Executive Function"]} icon={<User size={16}/>} />
                     <DetailRow label="Approved Auditor" value={selectedClient["Approved Auditor"]} icon={<FileCheck size={16}/>} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                    <PersonDetailList title="Board of Directors" records={selectedClient["Directors Names"] || []} />
                    <PersonDetailList title="Significant Shareholders" records={selectedClient["Significant Shareholders"] || []} />
                    <PersonDetailList title="Beneficial Owners (UBO)" records={selectedClient["UBO Details"] || []} />
                    <PersonDetailList title="Authorized Signatories" records={selectedClient["Authorized Signatory"] || []} />
                  </div>
               </div>
            </div>

            <div className="p-8 sm:p-10 bg-white border-t border-gray-100 flex justify-end items-center gap-6 shrink-0">
               <button onClick={() => setSelectedClient(null)} className="px-10 py-4 bg-gray-50 text-gray-400 rounded-2xl font-black text-[10px] uppercase tracking-widest">Close Dossier</button>
               {(isReviewerOrAdmin || (isDataEntry && selectedClient.created_by === currentUserId)) && (
                 <button 
                   onClick={handleDossierCommit}
                   disabled={isSubmitting}
                   className="px-10 py-4 bg-emerald-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2 hover:bg-emerald-900 transition-all disabled:opacity-50"
                 >
                    {isSubmitting ? <Loader2 size={18} className="animate-spin"/> : <FileSignature size={18}/>} 
                    Commit Update
                 </button>
               )}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-[2rem] sm:rounded-[3rem] w-full max-w-7xl h-[92vh] sm:h-auto max-h-[95vh] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-4">
            <div className={`${editMode ? 'bg-amber-600' : 'bg-emerald-900'} p-6 sm:p-8 text-white flex justify-between items-center shrink-0`}>
              <h3 className="text-xl sm:text-2xl font-black tracking-tight uppercase">
                 {editMode ? 'Modify Registry Identity' : 'Provision Identity'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="bg-white/10 p-2.5 rounded-full"><X size={20}/></button>
            </div>
            <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-8 custom-scrollbar bg-gray-50/30 pb-24">
              {submissionError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-[1.5rem] flex items-center gap-4 animate-in slide-in-from-top-2">
                  <div className="p-2 bg-red-600 text-white rounded-lg animate-pulse">
                    <AlertTriangle size={18} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black uppercase text-red-600 tracking-widest">Protocol Persistence Warning</p>
                    <p className="text-xs font-bold text-red-800 uppercase tracking-tight leading-tight">{submissionError}</p>
                  </div>
                  <button type="button" onClick={() => setSubmissionError(null)} className="p-2 text-red-400 hover:text-red-900"><X size={16}/></button>
                </div>
              )}
              
              <FormSection title="Registry & Identity" icon={<Landmark size={18}/>}>
                <div className="sm:col-span-2">
                  <InputField label="Entity Legal Name" value={formData["Client Name"]} onChange={(v:any)=>setFormData({...formData, "Client Name": v})} required hasError={formErrors.includes("Client Name")} />
                </div>
                <InputField label="File Reference" value={formData["No"]} onChange={(v:any)=>setFormData({...formData, "No": v})} required hasError={formErrors.includes("No")} />
                <InputField label="Jurisdiction" value={formData["Company Nationality"]} onChange={(v:any)=>setFormData({...formData, "Company Nationality": v})} required hasError={formErrors.includes("Company Nationality")} />
                <InputField label="Legal Structure" value={formData["Legal Structure"]} onChange={(v:any)=>setFormData({...formData, "Legal Structure": v})} />
                <InputField label="QFC No" value={formData["QFC No"]} onChange={(v:any)=>setFormData({...formData, "QFC No": v})} />
                <InputField label="Company Type" value={formData["Company Type"]} onChange={(v:any)=>setFormData({...formData, "Company Type": v})} />
                <div className="sm:col-span-2">
                  <InputField label="Nature of Business" value={formData["Nature of Business"]} onChange={(v:any)=>setFormData({...formData, "Nature of Business": v})} />
                </div>
              </FormSection>

              <FormSection title="Compliance & Timeline" icon={<Calendar size={18}/>}>
                <InputField label="Engagement Year" value={formData["Engagement Year"]} onChange={(v:any)=>setFormData({...formData, "Engagement Year": v})} />
                <InputField label="Engagement Date" type="date" value={formData["Engagement Date"]} onChange={(v:any)=>setFormData({...formData, "Engagement Date": v})} />
                <InputField label="Onboarding Date" type="date" value={formData["Onboarding Date"]} onChange={(v:any)=>setFormData({...formData, "Onboarding Date": v})} />
                <InputField label="Incorporation Date" type="date" value={formData["Date of QFC Incorporation or Registration"]} onChange={(v:any)=>setFormData({...formData, "Date of QFC Incorporation or Registration": v})} />
              </FormSection>

              <FormSection title="Licensing & Documentation" icon={<FileBadge size={18}/>}>
                <InputField label="License" value={formData["License"]} onChange={(v:any)=>setFormData({...formData, "License": v})} />
                <InputField label="License Expiry" type="date" value={formData["License Expiry"]} onChange={(v:any)=>setFormData({...formData, "License Expiry": v})} />
                <InputField label="Entity Card No" value={formData["Entity Card No"]} onChange={(v:any)=>setFormData({...formData, "Entity Card No": v})} />
                <InputField label="Entity Card Expiry" type="date" value={formData["Entity Card Expiry"]} onChange={(v:any)=>setFormData({...formData, "Entity Card Expiry": v})} />
                <InputField label="CR Expiry Date" type="date" value={formData["CR Expired date"]} onChange={(v:any)=>setFormData({...formData, "CR Expired date": v})} />
              </FormSection>

              <FormSection title="Contact & Communications" icon={<MapPin size={18}/>}>
                <div className="sm:col-span-3">
                   <InputField label="Registered Address" value={formData["Registered Address"]} onChange={(v:any)=>setFormData({...formData, "Registered Address": v})} />
                </div>
                <InputField label="Telephone Number" value={formData["Telephone Number"]} onChange={(v:any)=>setFormData({...formData, "Telephone Number": v})} />
                <InputField label="Email Address" type="email" value={formData["E Mail"]} onChange={(v:any)=>setFormData({...formData, "E Mail": v})} />
                <InputField label="Website" value={formData["Website"]} onChange={(v:any)=>setFormData({...formData, "Website": v})} />
              </FormSection>

              <FormSection title="Governance & Stakeholders" icon={<UserCheck size={18}/>}>
                <InputField label="Company Secretary" value={formData["Secretary"]} onChange={(v:any)=>setFormData({...formData, "Secretary": v})} />
                <InputField label="Senior Executive" value={formData["Senior Executive Function"]} onChange={(v:any)=>setFormData({...formData, "Senior Executive Function": v})} />
                <InputField label="Approved Auditor" value={formData["Approved Auditor"]} onChange={(v:any)=>setFormData({...formData, "Approved Auditor": v})} />
                <div className="sm:col-span-3 h-px bg-gray-100 my-4" />
                <div className="sm:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <PersonRecordManager title="Directors Names" records={formData["Directors Names"]} onUpdate={(v) => setFormData({...formData, "Directors Names": v})} />
                  <PersonRecordManager title="Significant Shareholders" records={formData["Significant Shareholders"]} onUpdate={(v) => setFormData({...formData, "Significant Shareholders": v})} />
                  <PersonRecordManager title="UBO Details" records={formData["UBO Details"]} onUpdate={(v) => setFormData({...formData, "UBO Details": v})} />
                  <PersonRecordManager title="Authorized Signatories" records={formData["Authorized Signatory"]} onUpdate={(v) => setFormData({...formData, "Authorized Signatory": v})} />
                </div>
              </FormSection>

              <div className="flex justify-end gap-3 pb-8 sticky bottom-0 bg-white/90 backdrop-blur-md pt-5 border-t z-10 px-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-4 font-black text-[10px] uppercase text-gray-400">Cancel</button>
                <button type="submit" disabled={isSubmitting} className={`${editMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-800 hover:bg-emerald-900'} text-white px-10 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2 disabled:opacity-50 transition-all`}>
                  {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20}/>} 
                  {editMode ? 'Commit Modifications' : (isDataEntry ? 'Submit for Review' : 'Commit Entity')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientManager;
