"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { 
  History, 
  Settings, 
  Search, 
  Mail, 
  ShieldCheck, 
  Plane, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw,
  Clock,
  LayoutGrid,
  Check,
  X,
  Download,
  Trash2,
  Megaphone,
  Eye,
  EyeOff
} from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  
  // Auth states
  const [authLoading, setAuthLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  // Navigation & Data States
  const [activeTab, setActiveTab] = useState("requests"); // "requests" | "settings"
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [requests, setRequests] = useState([]);
  const [isMock, setIsMock] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("simplified"); // "simplified" | "full"

  // Email logs state
  const [emailLogs, setEmailLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [emailLogsSearch, setEmailLogsSearch] = useState("");

  // Settings State
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [airportAdminEmail, setAirportAdminEmail] = useState("");
  const [emailSubjectPrefix, setEmailSubjectPrefix] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [adminEmails, setAdminEmails] = useState("");
  const [ccDecisionEmails, setCcDecisionEmails] = useState("");
  const [operatorsList, setOperatorsList] = useState("");
  const [operationalEmails, setOperationalEmails] = useState("");
  const [operatorsEmails, setOperatorsEmails] = useState("");
  const [stationStartLocal, setStationStartLocal] = useState("00:15");
  const [stationEndLocal, setStationEndLocal] = useState("17:45");
  const [leadTimeRegular, setLeadTimeRegular] = useState(2);
  const [leadTimeNonRegular, setLeadTimeNonRegular] = useState(2);
  const [leadTimePrivate, setLeadTimePrivate] = useState(24);
  const [leadTimeCargo, setLeadTimeCargo] = useState(2);
  const [leadTimeUti, setLeadTimeUti] = useState(0);
  const [leadTimeOther, setLeadTimeOther] = useState(0);

  // Delinquents State
  const [delinquentAircrafts, setDelinquentAircrafts] = useState([]);
  const [delinquentsListLoading, setDelinquentsListLoading] = useState(false);
  const [delinquentActionLoading, setDelinquentActionLoading] = useState(false);
  const [delinquentRegistration, setDelinquentRegistration] = useState("");
  const [delinquentTaxId, setDelinquentTaxId] = useState("");
  const [delinquentCompanyName, setDelinquentCompanyName] = useState("");
  const [delinquentObservations, setDelinquentObservations] = useState("");

  // Announcements State
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [announcementActive, setAnnouncementActive] = useState(true);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null);

  const fetchDelinquents = async () => {
    setDelinquentsListLoading(true);
    try {
      const res = await fetch("/api/admin/delinquents");
      const data = await res.json();
      if (res.ok) {
        setDelinquentAircrafts(data.delinquents || []);
      } else {
        throw new Error(data.error || "Erro ao buscar inadimplentes");
      }
    } catch (err) {
      console.error("Fetch delinquents error:", err);
    } finally {
      setDelinquentsListLoading(false);
    }
  };

  // Fetch requests and settings
  const fetchData = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      // 1. Fetch requests
      const requestsRes = await fetch("/api/admin/requests");
      const requestsData = await requestsRes.json();
      if (!requestsRes.ok) throw new Error(requestsData.error || "Erro ao carregar solicitações");
      setRequests(requestsData.requests || []);
      setIsMock(requestsData.mock || false);

      // 2. Fetch settings
      const settingsRes = await fetch("/api/admin/settings");
      const settingsData = await settingsRes.json();
      if (!settingsRes.ok) throw new Error(settingsData.error || "Erro ao carregar configurações");
      
      const s = settingsData.settings || {};
      setAirportAdminEmail(s.airportAdminEmail || "");
      setEmailSubjectPrefix(s.emailSubjectPrefix || "");
      setCustomNotes(s.customNotes || "");
      setAdminEmails(s.adminEmails || "");
      setCcDecisionEmails(s.ccDecisionEmails || "");
      setOperatorsList(s.operatorsList || "");
      setOperationalEmails(s.operationalEmails || "");
      setOperatorsEmails(s.operatorsEmails || "");
      setStationStartLocal(s.stationStartLocal || "00:15");
      setStationEndLocal(s.stationEndLocal || "17:45");
      setLeadTimeRegular(s.leadTimeRegular !== undefined ? s.leadTimeRegular : 2);
      setLeadTimeNonRegular(s.leadTimeNonRegular !== undefined ? s.leadTimeNonRegular : 2);
      setLeadTimePrivate(s.leadTimePrivate !== undefined ? s.leadTimePrivate : 24);
      setLeadTimeCargo(s.leadTimeCargo !== undefined ? s.leadTimeCargo : 2);
      setLeadTimeUti(s.leadTimeUti !== undefined ? s.leadTimeUti : 0);
      setLeadTimeOther(s.leadTimeOther !== undefined ? s.leadTimeOther : 0);
      
      // 3. Fetch delinquents
      await fetchDelinquents();
      
    } catch (err) {
      console.error("Admin fetch error:", err);
      setErrorMsg(err.message || "Erro de conexão ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  };

  const fetchEmailLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch("/api/admin/email-logs");
      const data = await res.json();
      if (res.ok) {
        setEmailLogs(data.logs || []);
      } else {
        throw new Error(data.error || "Erro ao buscar logs de e-mail");
      }
    } catch (err) {
      console.error("Fetch email logs error:", err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleResendEmail = async (logId) => {
    if (!confirm("Tem certeza que deseja reenviar este e-mail?")) return;
    setLogsLoading(true);
    setSuccessMsg("");
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/email-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend", logId })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(data.message || "E-mail reenviado com sucesso!");
        await fetchEmailLogs();
      } else {
        throw new Error(data.error || "Erro ao reenviar e-mail");
      }
    } catch (err) {
      console.error("Resend email error:", err);
      setErrorMsg(err.message);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleConfirmManual = async (requestId) => {
    if (!confirm("Tem certeza que deseja confirmar esta solicitação manualmente? Isso ignorará a validação de token do cliente e enviará os e-mails operacionais.")) return;
    setLoading(true);
    setSuccessMsg("");
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/email-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm-manual", requestId })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(data.message || "Solicitação confirmada manualmente!");
        await fetchData();
        if (activeTab === "logs") {
          await fetchEmailLogs();
        }
      } else {
        throw new Error(data.error || "Erro ao confirmar manualmente");
      }
    } catch (err) {
      console.error("Confirm manual error:", err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnnouncements = async () => {
    setAnnouncementsLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/announcements");
      const data = res.ok ? await res.json() : null;
      if (data && data.success) {
        setAnnouncements(data.announcements || []);
      } else {
        throw new Error(data?.error || "Erro ao carregar comunicados");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Falha ao carregar comunicados: " + err.message);
    } finally {
      setAnnouncementsLoading(false);
    }
  };

  const handleSaveAnnouncement = async (e) => {
    e.preventDefault();
    setSuccessMsg("");
    setErrorMsg("");
    setAnnouncementsLoading(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingAnnouncementId,
          title: announcementTitle,
          content: announcementContent,
          active: announcementActive
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message || "Aviso salvo com sucesso!");
        setAnnouncementTitle("");
        setAnnouncementContent("");
        setAnnouncementActive(true);
        setEditingAnnouncementId(null);
        await fetchAnnouncements();
      } else {
        throw new Error(data.error || "Erro ao salvar comunicado");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setAnnouncementsLoading(false);
    }
  };

  const handleEditAnnouncement = (ann) => {
    setAnnouncementTitle(ann.title);
    setAnnouncementContent(ann.content);
    setAnnouncementActive(ann.active);
    setEditingAnnouncementId(ann.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteAnnouncement = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir permanentemente este comunicado?")) return;
    setSuccessMsg("");
    setErrorMsg("");
    setAnnouncementsLoading(true);
    try {
      const res = await fetch(`/api/admin/announcements?id=${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message || "Comunicado excluído com sucesso!");
        await fetchAnnouncements();
      } else {
        throw new Error(data.error || "Erro ao excluir comunicado");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setAnnouncementsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "logs") {
      fetchEmailLogs();
    } else if (activeTab === "announcements") {
      fetchAnnouncements();
    }
  }, [activeTab]);

  useEffect(() => {
    if (!auth) {
      // Sandbox mode: permit access
      setAuthLoading(false);
      setAuthorized(true);
      fetchData();
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        // Redirect to login if not logged in
        router.push("/login");
      } else {
        const email = currentUser.email || "";
        const lowerEmail = email.toLowerCase();
        
        // 1. Check if email is the absolute admin (Wilkson)
        let isAdmin = lowerEmail === "wilkson.carvalho@navbrasil.gov.br";

        // 2. Sandbox/simulation mode fallbacks
        const isSandbox = !db;
        if (isSandbox) {
          isAdmin = 
            lowerEmail === "wilkson.carvalho@navbrasil.gov.br" ||
            lowerEmail === "gernavsbiz@gmail.com" ||
            lowerEmail === "developer@sbiz.local";
        }
        
        // 3. Dynamic check in Firestore (settings list and profile roles)
        if (!isAdmin && db) {
          try {
            // First check config/settings for dynamic adminEmails configuration list by querying the server-side settings API
            const settingsRes = await fetch("/api/admin/settings");
            if (settingsRes.ok) {
              const settingsData = await settingsRes.json();
              const allowedAdminsStr = settingsData.settings?.adminEmails || "";
              const allowedAdmins = allowedAdminsStr
                .split(/[,;]/)
                .map(e => e.trim().toLowerCase())
                .filter(e => e.length > 0);

              if (allowedAdmins.includes(lowerEmail)) {
                isAdmin = true;
              }
            }
          } catch (settingsErr) {
            console.error("Error reading adminEmails settings from dynamic config API:", settingsErr);
          }

          // Fallback to checking profile role as secondary authority
          if (!isAdmin) {
            try {
              const profileRef = doc(db, "profiles", currentUser.uid);
              const profileSnap = await getDoc(profileRef);
              if (profileSnap.exists()) {
                const profileData = profileSnap.data();
                if (profileData.role === "admin") {
                  isAdmin = true;
                }
              }
            } catch (profileErr) {
              console.error("Error checking admin profile role in Firestore:", profileErr);
            }
          }
        }

        if (isAdmin) {
          setAuthorized(true);
          fetchData();
        } else {
          setAuthorized(false);
        }
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Handle settings update
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSuccessMsg("");
    setErrorMsg("");
    setSettingsLoading(true);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          airportAdminEmail,
          emailSubjectPrefix,
          customNotes,
          adminEmails,
          ccDecisionEmails,
          operatorsList,
          operationalEmails,
          operatorsEmails,
          stationStartLocal,
          stationEndLocal,
          leadTimeRegular,
          leadTimeNonRegular,
          leadTimePrivate,
          leadTimeCargo,
          leadTimeUti,
          leadTimeOther
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || "Erro ao salvar configurações");

      setSuccessMsg("Configurações atualizadas com sucesso!");
      // Automatically clear message after 4s
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Save settings error:", err);
      setErrorMsg(err.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  // Handle request approval decision
  const handleApprove = async (id, decision) => {
    if (decision === "cancelled") {
      if (!confirm("Tem certeza que deseja cancelar esta prorrogação de horário que já foi autorizada? Um e-mail de notificação será enviado ao operador.")) {
        return;
      }
    }

    let justification = "";
    if (decision === "not_authorized") {
      const input = window.prompt("Justificativa da RECUSA (OBRIGATÓRIA):");
      if (input === null) return; // User cancelled
      if (!input.trim()) {
        alert("A justificativa é obrigatória para recusar a solicitação.");
        return;
      }
      justification = input.trim();
    } else if (decision === "authorized") {
      const input = window.prompt("Mensagem complementar / Observações (OPCIONAL):");
      if (input === null) return; // User cancelled
      justification = input.trim();
    }

    setSuccessMsg("");
    setErrorMsg("");
    setLoading(true);

    try {
      // For sandbox mode simulation: directly update local state
      if (isMock) {
        setRequests(prev => prev.map(req => {
          if (req.id === id) {
            return {
              ...req,
              approvalStatus: decision,
              justification: justification || null,
              ...(decision === "authorized" ? { authorizedAt: new Date().toISOString() } : {}),
              ...(decision === "cancelled" ? { cancelledAt: new Date().toISOString() } : {})
            };
          }
          return req;
        }));
        let msgDesc = "autorizada";
        if (decision === "not_authorized") msgDesc = "recusada";
        if (decision === "cancelled") msgDesc = "cancelada";
        setSuccessMsg(`[SIMULAÇÃO] Solicitação ${msgDesc} com sucesso!`);
        setTimeout(() => setSuccessMsg(""), 4000);
        return;
      }

      const response = await fetch("/api/admin/requests/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, justification })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || "Erro ao registrar decisão do administrador.");

      setSuccessMsg(resData.message);
      await fetchData();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Approval decision error:", err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRequest = async (id) => {
    if (!window.confirm("Tem certeza de que deseja excluir esta solicitação? Esta ação é irreversível e removerá o registro permanentemente.")) {
      return;
    }

    setSuccessMsg("");
    setErrorMsg("");
    setLoading(true);

    try {
      const response = await fetch(`/api/admin/requests?id=${id}`, {
        method: "DELETE",
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || "Erro ao excluir solicitação.");

      setSuccessMsg("Solicitação excluída com sucesso!");
      await fetchData();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Delete request error:", err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDelinquent = async (e) => {
    e.preventDefault();
    setSuccessMsg("");
    setErrorMsg("");
    setDelinquentActionLoading(true);

    try {
      const response = await fetch("/api/admin/delinquents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          registration: delinquentRegistration.trim().toUpperCase(),
          taxId: delinquentTaxId.trim(),
          companyName: delinquentCompanyName.trim(),
          observations: delinquentObservations.trim()
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || "Erro ao adicionar restrição.");

      setSuccessMsg("Aeronave restrita adicionada com sucesso!");
      setDelinquentRegistration("");
      setDelinquentTaxId("");
      setDelinquentCompanyName("");
      setDelinquentObservations("");
      
      await fetchDelinquents();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Add delinquent error:", err);
      setErrorMsg(err.message);
    } finally {
      setDelinquentActionLoading(false);
    }
  };

  const handleDeleteDelinquent = async (id) => {
    setSuccessMsg("");
    setErrorMsg("");
    setDelinquentActionLoading(true);

    try {
      const response = await fetch("/api/admin/delinquents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          id
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || "Erro ao remover restrição.");

      setSuccessMsg("Aeronave removida da lista de restrições.");
      await fetchDelinquents();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Delete delinquent error:", err);
      setErrorMsg(err.message);
    } finally {
      setDelinquentActionLoading(false);
    }
  };

  // Metrics calculations
  const totalCount = requests.length;
  const confirmedCount = requests.filter(r => r.status === "confirmed").length;
  const pendingCount = requests.filter(r => r.status === "pending_confirmation").length;
  const authorizedCount = requests.filter(r => r.approvalStatus === "authorized").length;
  const cancelledCount = requests.filter(r => r.approvalStatus === "cancelled" || r.status === "cancelled").length;

  // Filter requests
  const filteredRequests = requests.filter(r => {
    const query = searchQuery.toLowerCase();
    return (
      r.id.toLowerCase().includes(query) ||
      r.company?.name?.toLowerCase().includes(query) ||
      r.requestor?.name?.toLowerCase().includes(query) ||
      r.aircraft?.typeQty?.toLowerCase().includes(query)
    );
  });

  const handleLogout = async () => {
    if (!auth) {
      router.push("/login");
      return;
    }
    try {
      await signOut(auth);
      router.push("/login");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  if (authLoading) {
    return (
      <div className="container" style={{ justifyContent: "center", alignItems: "center" }}>
        <span className="spinner" style={{ width: "40px", height: "40px" }}></span>
        <p style={{ marginTop: "16px", color: "var(--text-dark-muted)" }}>Verificando credenciais...</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="container" style={{ justifyContent: "center", alignItems: "center" }}>
        <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "rgba(239, 68, 68, 0.1)",
            border: "2px solid var(--error)",
            color: "var(--error)",
            marginBottom: "20px"
          }}>
            <AlertTriangle size={32} />
          </div>
          <h2 style={{ fontSize: "22px", color: "white", marginBottom: "12px" }}>Acesso Restrito</h2>
          <p style={{ color: "var(--text-dark-muted)", fontSize: "14px", lineHeight: "1.5", marginBottom: "28px" }}>
            Seu e-mail <strong>{auth?.currentUser?.email}</strong> não possui privilégios de administrador para acessar o Painel de Operações.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button onClick={() => router.push("/dashboard")} className="btn">
              Ir para o Dashboard
            </button>
            <button onClick={handleLogout} className="btn btn-secondary" style={{ marginTop: 0 }}>
              Entrar com outra conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Plane size={20} style={{ color: "var(--accent)", transform: "rotate(45deg)" }} />
          <span style={{ fontWeight: 800, fontSize: "16px" }}>SBIZ NAVMANAGER</span>
          <span style={{ 
            fontSize: "10px", 
            background: "var(--primary-light)", 
            color: "white", 
            padding: "2px 6px", 
            borderRadius: "4px",
            fontWeight: "bold",
            letterSpacing: "0.05em"
          }}>ADMIN</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => router.push("/operacional")} className="logout-btn" style={{ color: "white" }}>
            <History size={15} style={{ color: "#3b82f6" }} />
            <span>Operacional</span>
          </button>
          <button onClick={() => router.push("/dashboard")} className="logout-btn" style={{ color: "white" }}>
            <LayoutGrid size={15} />
            <span>Formulário</span>
          </button>
        </div>
      </header>

      <main className="container" style={{ minHeight: "auto", padding: "24px 16px 60px 16px", maxWidth: "800px" }}>
        
        {/* Title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h1 style={{ fontSize: "24px", color: "white" }}>Painel de Operações</h1>
            <p style={{ fontSize: "13px", color: "var(--text-dark-muted)" }}>
              Gerenciamento administrativo de prorrogações de horário e configuração de e-mails.
            </p>
          </div>
          <button 
            onClick={fetchData} 
            className="admin-action-btn"
            disabled={loading}
            style={{ padding: "8px" }}
            title="Atualizar dados"
          >
            <RefreshCw size={16} className={loading ? "spinner" : ""} />
          </button>
        </div>

        {/* Sandbox Warning */}
        {isMock && (
          <div className="notification" style={{ backgroundColor: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.2)", color: "#fef3c7" }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Modo de Simulação Ativo:</strong> Exibindo dados simulados. As chaves do Firebase Admin não estão configuradas localmente ou o servidor Next.js precisa ser reiniciado para ler as credenciais reais do arquivo `.env.local`.
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="notification notification-error">
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="notification notification-success">
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tabs System Header */}
        <div className="tabs-header">
          <button 
            className={`tab-btn ${activeTab === "requests" ? "active" : ""}`}
            onClick={() => setActiveTab("requests")}
          >
            <History size={16} />
            <span>Solicitações ({totalCount})</span>
          </button>
          <button 
            className={`tab-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <Settings size={16} />
            <span>Configurações</span>
          </button>
          <button 
            className={`tab-btn ${activeTab === "delinquents" ? "active" : ""}`}
            onClick={() => setActiveTab("delinquents")}
          >
            <AlertTriangle size={16} />
            <span>Aeronaves Inadimplentes</span>
          </button>
          <button 
            className={`tab-btn ${activeTab === "logs" ? "active" : ""}`}
            onClick={() => setActiveTab("logs")}
          >
            <Mail size={16} />
            <span>Logs de Envio</span>
          </button>
          <button 
            className={`tab-btn ${activeTab === "announcements" ? "active" : ""}`}
            onClick={() => setActiveTab("announcements")}
          >
            <Megaphone size={16} />
            <span>Avisos</span>
          </button>
        </div>

        {/* Tab 1: Requests List */}
        {activeTab === "requests" && (
          <>
            {/* Metrics cards grid */}
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-value">{totalCount}</div>
                <div className="metric-label">Total Recebido</div>
              </div>
              <div className="metric-card confirmed">
                <div className="metric-value">{confirmedCount}</div>
                <div className="metric-label">Confirmados</div>
              </div>
              <div className="metric-card pending">
                <div className="metric-value">{pendingCount}</div>
                <div className="metric-label">Aguardando Confirmar</div>
              </div>
              <div className="metric-card authorized">
                <div className="metric-value">{authorizedCount}</div>
                <div className="metric-label">Autorizados</div>
              </div>
              <div className="metric-card cancelled">
                <div className="metric-value">{cancelledCount}</div>
                <div className="metric-label">Cancelados</div>
              </div>
            </div>

            {/* Search filter input & Toggle Column button */}
            <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "stretch" }}>
              <div style={{ flex: 1, minWidth: "250px", position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: "14px", top: "15px", color: "var(--text-dark-muted)" }} />
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ paddingLeft: "42px", height: "46px" }}
                  placeholder="Pesquisar por ID, empresa, solicitante ou aeronave..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  disabled={loading}
                />
              </div>
              <button 
                onClick={() => setViewMode(viewMode === "simplified" ? "full" : "simplified")}
                className="admin-action-btn"
                style={{ 
                  height: "46px", 
                  padding: "0 16px", 
                  fontSize: "13px", 
                  display: "inline-flex", 
                  alignItems: "center", 
                  gap: "6px",
                  borderColor: viewMode === "full" ? "var(--accent)" : "rgba(255,255,255,0.15)",
                  color: viewMode === "full" ? "white" : "var(--text-dark-muted)",
                  background: viewMode === "full" ? "rgba(239, 91, 37, 0.15)" : "transparent"
                }}
                title="Expandir ou recolher colunas secundárias para melhor encaixe na tela"
              >
                {viewMode === "full" ? <EyeOff size={16} style={{ color: "var(--accent)" }} /> : <Eye size={16} />}
                <span>{viewMode === "full" ? "Visualização Simplificada" : "Mostrar Todas Colunas"}</span>
              </button>
            </div>

            {/* Requests Table */}
            {loading ? (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <span className="spinner" style={{ width: "30px", height: "30px" }}></span>
                <p style={{ marginTop: "12px", color: "var(--text-dark-muted)", fontSize: "14px" }}>Buscando registros...</p>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: "40px", backgroundColor: "rgba(255, 255, 255, 0.01)" }}>
                <Clock size={36} style={{ color: "var(--text-dark-muted)", margin: "0 auto 12px" }} />
                <h3 style={{ fontSize: "16px", color: "white" }}>Nenhuma solicitação encontrada</h3>
                <p style={{ fontSize: "13px", color: "var(--text-dark-muted)", marginTop: "4px" }}>
                  Não há registros correspondentes aos critérios de pesquisa informados.
                </p>
              </div>
            ) : (
              <div className="admin-table-container" style={{ maxHeight: "600px", overflowY: "auto" }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      {viewMode === "full" && <th>ID</th>}
                      <th>Empresa / Operador</th>
                      {viewMode === "full" && <th>Solicitante</th>}
                      {viewMode === "full" && <th>Aeronave</th>}
                      <th>Período Solicitado</th>
                      <th>Operador</th>
                      <th>Status</th>
                      {viewMode === "full" && <th>Assinatura / IP</th>}
                      {viewMode === "full" && <th>PDF</th>}
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map((req) => (
                      <tr key={req.id}>
                        {viewMode === "full" && (
                          <td style={{ fontFamily: "monospace", fontWeight: "bold", color: "var(--text-dark-muted)" }}>
                            #{req.id.slice(-6).toUpperCase()}
                          </td>
                        )}
                        <td>
                          <div style={{ fontWeight: 600, color: "white" }}>{req.company?.name}</div>
                          <div style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "2px" }}>
                            CNPJ: {req.company?.taxId}
                          </div>
                        </td>
                        {viewMode === "full" && (
                          <td>
                            <div>{req.requestor?.name}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "2px" }}>
                              {req.requestor?.role} {req.requestor?.billingEmail ? `| Fin: ${req.requestor.billingEmail}` : ''}
                            </div>
                          </td>
                        )}
                        {viewMode === "full" && (
                          <td>
                            <div>{req.aircraft?.typeQty}</div>
                            {req.aircraft?.registration && (
                              <div style={{ fontSize: "11px", color: "var(--accent)", marginTop: "2px", fontWeight: "bold" }}>
                                {req.aircraft.registration}
                              </div>
                            )}
                          </td>
                        )}
                        <td style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
                          <div><strong>De:</strong> {new Date(req.period?.start).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
                          <div style={{ marginTop: "2px" }}><strong>Até:</strong> {new Date(req.period?.end).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
                        </td>
                        <td>
                          {req.status === "confirmed" ? (
                            <span className="badge badge-success">Confirmado</span>
                          ) : (
                            <span className="badge badge-warning">Pendente</span>
                          )}
                        </td>
                        <td>
                          {req.approvalStatus === "authorized" && (
                            <span className="badge badge-success">Autorizado</span>
                          )}
                          {req.approvalStatus === "not_authorized" && (
                            <span className="badge badge-danger">Recusado</span>
                          )}
                          {req.approvalStatus === "cancelled" && (
                            <span className="badge badge-warning" style={{ backgroundColor: "#e8590c", color: "white" }}>Cancelada</span>
                          )}
                          {req.status === "confirmed" && (!req.approvalStatus || req.approvalStatus === "pending_analysis") && (
                            <span className="badge badge-info">Em Análise</span>
                          )}
                          {req.status !== "confirmed" && (!req.approvalStatus || req.approvalStatus === "waiting_confirmation") && (
                            <span className="badge badge-warning">Aguardando</span>
                          )}
                          {req.lateRequest && (
                            <div style={{ marginTop: "4px" }}>
                              <span 
                                className="badge" 
                                style={{ 
                                  fontSize: "9.5px", 
                                  padding: "2px 6px", 
                                  backgroundColor: "rgba(244, 63, 94, 0.15)", 
                                  color: "#f43f5e", 
                                  borderColor: "rgba(244, 63, 94, 0.3)",
                                  display: "inline-block"
                                }}
                              >
                                Fora do Prazo ({req.lateRequestDetails?.actualHours}h vs {req.lateRequestDetails?.requiredHours}h)
                              </span>
                            </div>
                          )}
                        </td>
                        {viewMode === "full" && (
                          <>
                            <td style={{ fontSize: "11px", color: "var(--text-dark-muted)" }}>
                              {req.status === "confirmed" ? (
                                <>
                                  <div>{new Date(req.confirmedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
                                  <div style={{ fontFamily: "monospace", marginTop: "2px" }}>IP: {req.confirmationIp}</div>
                                </>
                              ) : (
                                <span style={{ color: "rgba(255,255,255,0.15)" }}>Aguardando link</span>
                              )}
                            </td>
                            <td>
                              {req.status === "confirmed" && req.approvalStatus === "authorized" ? (
                                <a 
                                  href={`/api/requests/pdf?id=${req.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="admin-action-btn"
                                  style={{ 
                                    padding: "6px 10px", 
                                    fontSize: "11px", 
                                    gap: "4px", 
                                    backgroundColor: "rgba(239, 91, 37, 0.15)", 
                                    borderColor: "rgba(239, 91, 37, 0.4)", 
                                    color: "var(--text-dark)",
                                    textDecoration: "none"
                                  }}
                                  title="Baixar PDF Oficial"
                                  download
                                >
                                  <Download size={12} style={{ color: "var(--accent)" }} />
                                  <span>PDF</span>
                                </a>
                              ) : (
                                <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", fontStyle: "italic" }}>
                                  {req.status !== "confirmed" ? "Rascunho" : "Pendente/Recusado"}
                                </span>
                              )}
                            </td>
                          </>
                        )}
                        <td>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            {req.status === "confirmed" && (!req.approvalStatus || req.approvalStatus === "pending_analysis") ? (
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button 
                                  onClick={() => handleApprove(req.id, "authorized")}
                                  className="admin-action-btn btn-approve"
                                  style={{ padding: "6px 10px", fontSize: "11px", gap: "4px" }}
                                  title="Autorizar Horário"
                                >
                                  <Check size={12} />
                                  <span>Autorizar</span>
                                </button>
                                <button 
                                  onClick={() => handleApprove(req.id, "not_authorized")}
                                  className="admin-action-btn btn-reject"
                                  style={{ padding: "6px 10px", fontSize: "11px", gap: "4px" }}
                                  title="Recusar Horário"
                                >
                                  <X size={12} />
                                  <span>Recusar</span>
                                </button>
                              </div>
                            ) : req.status === "confirmed" && req.approvalStatus === "authorized" ? (
                              <button 
                                onClick={() => handleApprove(req.id, "cancelled")}
                                className="admin-action-btn btn-reject"
                                style={{ padding: "6px 10px", fontSize: "11px", gap: "4px", backgroundColor: "rgba(232, 89, 12, 0.15)", borderColor: "rgba(232, 89, 12, 0.4)", color: "#ffa8a8" }}
                                title="Cancelar Prorrogação Autorizada"
                              >
                                <X size={12} />
                                <span>Cancelar</span>
                              </button>
                            ) : req.status === "confirmed" && req.approvalStatus === "cancelled" ? (
                              <span style={{ fontSize: "11.5px", color: "#ffa8a8", fontWeight: "500" }}>
                                Cancelada
                              </span>
                            ) : req.status === "confirmed" ? (
                              <span style={{ fontSize: "11.5px", color: "var(--text-dark-muted)", fontWeight: "500" }}>
                                Finalizado
                              </span>
                            ) : (
                              req.status === "pending_confirmation" ? (
                                <button 
                                  onClick={() => handleConfirmManual(req.id)}
                                  className="admin-action-btn btn-approve"
                                  style={{ padding: "6px 10px", fontSize: "11px", gap: "4px" }}
                                  title="Confirmar Solicitação Manualmente"
                                >
                                  <Check size={12} />
                                  <span>Confirmar Manual</span>
                                </button>
                              ) : (
                                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.15)" }}>
                                  Sem Ações
                                </span>
                              )
                            )}
                            
                            <button
                              onClick={() => handleDeleteRequest(req.id)}
                              className="admin-action-btn btn-reject"
                              style={{ padding: "6px 10px", fontSize: "11px", gap: "4px" }}
                              title="Excluir Solicitação"
                            >
                              <Trash2 size={12} />
                              <span>Excluir</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Tab 2: Settings Configuration Form */}
        {activeTab === "settings" && (
          <div className="card" style={{ padding: "28px 24px", animation: "fadeIn 0.3s ease-out" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <Mail style={{ color: "var(--accent)" }} size={20} />
              <h3 style={{ fontSize: "18px", color: "white" }}>Fluxo de E-mail Oficial</h3>
            </div>
            
            <p style={{ fontSize: "13px", color: "var(--text-dark-muted)", lineHeight: "1.5", marginBottom: "24px" }}>
              Edite as configurações de despacho. Quando um operador clica no link de confirmação, o e-mail oficial contendo a solicitação e o anexo PDF é disparado para o destinatário configurado abaixo.
            </p>

            <form onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label className="form-label">E-mails Administrativos (Destinatários - separe por vírgula)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="administracao.sbiz@navbrasil.gov.br, faturamento@navbrasil.gov.br"
                  value={airportAdminEmail}
                  onChange={e => setAirportAdminEmail(e.target.value.toLowerCase())}
                  disabled={settingsLoading || loading}
                  required
                />
                <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "4px", display: "block" }}>
                  E-mails oficiais dos destinatários da NAV Brasil - DNIZ que receberão as solicitações prontas para cobrança (separe múltiplos por vírgula).
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">E-mails de Administradores (Permissão de Acesso - separe por vírgula)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="adriano.matos@navbrasil.gov.br, gernavsbiz@gmail.com"
                  value={adminEmails}
                  onChange={e => setAdminEmails(e.target.value.toLowerCase())}
                  disabled={settingsLoading || loading}
                />
                <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "4px", display: "block" }}>
                  E-mails dos usuários habilitados a acessar o Painel Administrativo e tomar decisões de aprovação. O e-mail <strong>wilkson.carvalho@navbrasil.gov.br</strong> é administrador absoluto e sempre terá acesso, mesmo que não listado.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">E-mails para Cópia de Decisão (Aprovação/Recusa - separe por vírgula)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="faturamento.sbiz@navbrasil.gov.br, supervisao.sbiz@navbrasil.gov.br"
                  value={ccDecisionEmails}
                  onChange={e => setCcDecisionEmails(e.target.value.toLowerCase())}
                  disabled={settingsLoading || loading}
                />
                <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "4px", display: "block" }}>
                  E-mails que receberão uma cópia do e-mail de notificação final (autorizado/recusado) enviado ao operador (separe múltiplos por vírgula).
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Prefixo do Assunto do E-mail</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="SOLICITAÇÃO DE PRORROGAÇÃO DE HORÁRIO - SBIZ"
                  value={emailSubjectPrefix}
                  onChange={e => setEmailSubjectPrefix(e.target.value)}
                  disabled={settingsLoading || loading}
                  required
                />
                <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "4px", display: "block" }}>
                  Título que introduz o assunto do e-mail oficial recebido (ex: `PRORROGAÇÃO DE HORÁRIO SBIZ`).
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Instruções / Notas da Administração (Rodapé do E-mail)</label>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: "120px", resize: "vertical" }}
                  placeholder="Instruções para a equipe de cobrança ou termos de responsabilidade adicionais..."
                  value={customNotes}
                  onChange={e => setCustomNotes(e.target.value)}
                  disabled={settingsLoading || loading}
                />
                <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "4px", display: "block" }}>
                  Texto dinâmico inserido como um destaque amarelo no corpo do e-mail oficial disparado para a gerência.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Profissionais PNA/OEA (Operadores - separe por vírgula)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Adriano Matos, João Silva, Marcos Souza"
                  value={operatorsList}
                  onChange={e => setOperatorsList(e.target.value)}
                  disabled={settingsLoading || loading}
                />
                <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "4px", display: "block" }}>
                  Nomes dos operadores autorizados a atender prorrogações de horário. Estes nomes aparecerão na lista de seleção no Painel Operacional.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">E-mails de Operadores (Acesso exclusivo ao Módulo Operacional - separe por vírgula)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="operador1@navbrasil.gov.br, operador2@navbrasil.gov.br"
                  value={operationalEmails}
                  onChange={e => setOperationalEmails(e.target.value.toLowerCase())}
                  disabled={settingsLoading || loading}
                />
                <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "4px", display: "block" }}>
                  Endereços de e-mail autorizados a acessar EXCLUSIVAMENTE o Módulo Operacional. Estes usuários não poderão acessar a página administrativa de configurações.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">E-mails dos Operadores PNA/OEA (Mapeamento de Notificações - um por linha)</label>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: "120px", resize: "vertical" }}
                  placeholder="Tahan: tahan.sbiz@navbrasil.gov.br&#10;Wilkson: wilkson.carvalho@navbrasil.gov.br"
                  value={operatorsEmails}
                  onChange={e => setOperatorsEmails(e.target.value.toLowerCase())}
                  disabled={settingsLoading || loading}
                />
                <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "4px", display: "block" }}>
                  Associe cada operador ao seu respectivo e-mail no formato <code>Nome: email</code> (um por linha). Ex: <code>Tahan: tahan.sbiz@navbrasil.gov.br</code>. Quando houver uma alteração de horário, o operador do respectivo turno receberá uma notificação por e-mail.
                </span>
              </div>

              <h3 style={{ color: "white", fontSize: "14px", marginTop: "24px", marginBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px" }}>
                Funcionamento da Estação
              </h3>
              <div className="form-grid" style={{ marginBottom: "20px" }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Início do Funcionamento (LOCAL Brasília)</label>
                  <input 
                    type="time" 
                    className="form-input" 
                    value={stationStartLocal}
                    onChange={e => setStationStartLocal(e.target.value)}
                    disabled={settingsLoading || loading}
                    required
                  />
                  <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "4px", display: "block" }}>
                    Horário em que a estação inicia o funcionamento operacional padrão (Ex: 00:15).
                  </span>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fim do Funcionamento (LOCAL Brasília)</label>
                  <input 
                    type="time" 
                    className="form-input" 
                    value={stationEndLocal}
                    onChange={e => setStationEndLocal(e.target.value)}
                    disabled={settingsLoading || loading}
                    required
                  />
                  <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "4px", display: "block" }}>
                    Horário em que a estação encerra o funcionamento operacional padrão (Ex: 17:45).
                  </span>
                </div>
              </div>

              <h3 style={{ color: "white", fontSize: "14px", marginTop: "24px", marginBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px" }}>
                Antecedência Mínima para Solicitações (MCA 102-7)
              </h3>
              <div className="form-grid" style={{ marginBottom: "20px" }}>
                <div className="form-group">
                  <label className="form-label">Voo Regular (horas)</label>
                  <input 
                    type="number" 
                    min="0"
                    className="form-input" 
                    value={leadTimeRegular}
                    onChange={e => setLeadTimeRegular(Number(e.target.value))}
                    disabled={settingsLoading || loading}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Fretamento / Não-Regular (horas)</label>
                  <input 
                    type="number" 
                    min="0"
                    className="form-input" 
                    value={leadTimeNonRegular}
                    onChange={e => setLeadTimeNonRegular(Number(e.target.value))}
                    disabled={settingsLoading || loading}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Aviação Geral / Executiva (horas)</label>
                  <input 
                    type="number" 
                    min="0"
                    className="form-input" 
                    value={leadTimePrivate}
                    onChange={e => setLeadTimePrivate(Number(e.target.value))}
                    disabled={settingsLoading || loading}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Carga Aérea (horas)</label>
                  <input 
                    type="number" 
                    min="0"
                    className="form-input" 
                    value={leadTimeCargo}
                    onChange={e => setLeadTimeCargo(Number(e.target.value))}
                    disabled={settingsLoading || loading}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">AeroMédico / UTI (horas)</label>
                  <input 
                    type="number" 
                    min="0"
                    className="form-input" 
                    value={leadTimeUti}
                    onChange={e => setLeadTimeUti(Number(e.target.value))}
                    disabled={settingsLoading || loading}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Militar / Outros (horas)</label>
                  <input 
                    type="number" 
                    min="0"
                    className="form-input" 
                    value={leadTimeOther}
                    onChange={e => setLeadTimeOther(Number(e.target.value))}
                    disabled={settingsLoading || loading}
                    required
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="btn" 
                disabled={settingsLoading || loading}
                style={{ marginTop: "12px", gap: "10px" }}
              >
                {settingsLoading ? (
                  <span className="spinner"></span>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    Salvar Configurações
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Delinquent Aircrafts */}
        {activeTab === "delinquents" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", animation: "fadeIn 0.3s ease-out" }}>
            {/* Add delinquent form */}
            <div className="card" style={{ padding: "28px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                <AlertTriangle style={{ color: "var(--accent)" }} size={20} />
                <h3 style={{ fontSize: "18px", color: "white" }}>Restringir Aeronave (Inadimplência)</h3>
              </div>
              
              <p style={{ fontSize: "13px", color: "var(--text-dark-muted)", lineHeight: "1.5", marginBottom: "24px" }}>
                Cadastre abaixo aeronaves inadimplentes. Qualquer nova solicitação contendo a matrícula informada será reprovada imediatamente no momento da confirmação.
              </p>

              <form onSubmit={handleAddDelinquent}>
                <div className="form-group">
                  <label className="form-label">Matrícula da Aeronave</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ex: PT-XYZ, PS-ABC"
                    value={delinquentRegistration}
                    onChange={e => setDelinquentRegistration(e.target.value.toUpperCase())}
                    disabled={delinquentActionLoading}
                    required
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">CNPJ ou CPF da Empresa</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="00.000.000/0000-00"
                      value={delinquentTaxId}
                      onChange={e => setDelinquentTaxId(e.target.value)}
                      disabled={delinquentActionLoading}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Nome da Empresa</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Empresa Aérea Ltda"
                      value={delinquentCompanyName}
                      onChange={e => setDelinquentCompanyName(e.target.value)}
                      disabled={delinquentActionLoading}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Observações</label>
                  <textarea 
                    className="form-input" 
                    style={{ minHeight: "80px", resize: "vertical" }}
                    placeholder="Informações adicionais sobre o motivo da inadimplência ou restrição..."
                    value={delinquentObservations}
                    onChange={e => setDelinquentObservations(e.target.value)}
                    disabled={delinquentActionLoading}
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn" 
                  disabled={delinquentActionLoading}
                  style={{ marginTop: "12px", gap: "10px" }}
                >
                  {delinquentActionLoading ? (
                    <span className="spinner"></span>
                  ) : (
                    <>
                      <Check size={18} />
                      Adicionar Aeronave
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Delinquents list */}
            <div className="card" style={{ padding: "24px" }}>
              <h3 style={{ fontSize: "16px", color: "white", marginBottom: "16px" }}>Aeronaves Restritas</h3>
              
              {delinquentsListLoading ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <span className="spinner" style={{ width: "24px", height: "24px" }}></span>
                  <p style={{ marginTop: "12px", color: "var(--text-dark-muted)", fontSize: "13px" }}>Buscando registros...</p>
                </div>
              ) : delinquentAircrafts.length === 0 ? (
                <p style={{ fontSize: "13px", color: "var(--text-dark-muted)", textAlign: "center", padding: "20px 0" }}>
                  Nenhuma aeronave inadimplente cadastrada.
                </p>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Matrícula</th>
                        <th>Empresa</th>
                        <th>CNPJ/CPF</th>
                        <th>Observações</th>
                        <th>Cadastrado em</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delinquentAircrafts.map((ac) => (
                        <tr key={ac.id}>
                          <td style={{ fontWeight: "bold", color: "var(--accent)" }}>{ac.registration}</td>
                          <td>{ac.companyName}</td>
                          <td>{ac.taxId}</td>
                          <td>
                            {ac.observations ? (
                              <span style={{ fontSize: "12px", color: "var(--text-dark)" }}>{ac.observations}</span>
                            ) : (
                              <span style={{ fontSize: "12px", color: "var(--text-dark-muted)", fontStyle: "italic" }}>Sem observações</span>
                            )}
                          </td>
                          <td style={{ fontSize: "12px", color: "var(--text-dark-muted)" }}>
                            {new Date(ac.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                          </td>
                          <td>
                            <button 
                              type="button"
                              onClick={() => handleDeleteDelinquent(ac.id)}
                              className="admin-action-btn btn-reject"
                              style={{ padding: "6px 10px", fontSize: "11px", gap: "4px" }}
                              disabled={delinquentActionLoading}
                            >
                              <X size={12} />
                              <span>Remover</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Email Logs */}
        {activeTab === "logs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", animation: "fadeIn 0.3s ease-out" }}>
            <div className="card" style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Mail style={{ color: "var(--accent)" }} size={20} />
                  <h3 style={{ fontSize: "18px", color: "white", margin: 0 }}>Histórico de Envio de E-mails</h3>
                </div>
                <button 
                  onClick={fetchEmailLogs}
                  className="btn" 
                  style={{ padding: "8px 16px", fontSize: "13px", gap: "6px" }}
                  disabled={logsLoading}
                >
                  <RefreshCw size={14} className={logsLoading ? "spinner" : ""} />
                  <span>Atualizar</span>
                </button>
              </div>

              {/* Search Bar inside Logs */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ position: "relative" }}>
                  <Search style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-dark-muted)" }} size={16} />
                  <input 
                    type="text" 
                    className="form-input" 
                    style={{ paddingLeft: "42px" }}
                    placeholder="Filtrar logs por e-mail destinatário, assunto ou ID..."
                    value={emailLogsSearch}
                    onChange={e => setEmailLogsSearch(e.target.value)}
                  />
                </div>
              </div>

              {logsLoading ? (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <span className="spinner" style={{ width: "32px", height: "32px" }}></span>
                  <p style={{ marginTop: "12px", color: "var(--text-dark-muted)", fontSize: "14px" }}>Carregando logs de e-mail...</p>
                </div>
              ) : emailLogs.length === 0 ? (
                <p style={{ fontSize: "13px", color: "var(--text-dark-muted)", textAlign: "center", padding: "40px 0" }}>
                  Nenhum log de e-mail registrado.
                </p>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Data/Hora</th>
                        <th>Tipo</th>
                        <th>Destinatário</th>
                        <th>Assunto</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emailLogs
                        .filter(log => {
                          const query = emailLogsSearch.toLowerCase();
                          const recipientString = log.to ? log.to.map(t => typeof t === 'string' ? t : `${t.name || ""} <${t.email}>`).join(" ").toLowerCase() : "";
                          const subjectString = (log.subject || "").toLowerCase();
                          const idString = (log.requestId || "").toLowerCase();
                          return recipientString.includes(query) || subjectString.includes(query) || idString.includes(query);
                        })
                        .map((log) => {
                          const emailTypeLabels = {
                            user_confirmation: "Confirmação do Cliente",
                            admin_notification: "Notificação Admin (Confirmação)",
                            admin_pre_notification: "Notificação Admin (Rascunho)",
                            operator_decision: "Decisão do Operador",
                            operator_notification: "Aviso de Escala OEA",
                            delinquent_rejection: "Rejeição Automática",
                            failure_notification: "Alerta de Falha de E-mail"
                          };
                          const badgeColors = {
                            user_confirmation: "#2b8a3e",
                            admin_notification: "#0b7285",
                            admin_pre_notification: "#1098ad",
                            operator_decision: "#d9480f",
                            operator_notification: "#f59f00",
                            delinquent_rejection: "#c92a2a",
                            failure_notification: "#e8590c"
                          };

                          const formatRecipient = (toField) => {
                            if (!toField) return "N/A";
                            if (Array.isArray(toField)) {
                              return toField.map(t => typeof t === 'string' ? t : `${t.name ? t.name + ' ' : ''}<${t.email}>`).join(", ");
                            }
                            return String(toField);
                          };

                          return (
                            <tr key={log.id}>
                              <td style={{ fontSize: "12px", color: "var(--text-dark-muted)", whiteSpace: "nowrap" }}>
                                {new Date(log.sentAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                              </td>
                              <td>
                                <span style={{ 
                                  fontSize: "11px", 
                                  fontWeight: "bold", 
                                  color: "white", 
                                  backgroundColor: badgeColors[log.emailType] || "#495057",
                                  padding: "3px 8px",
                                  borderRadius: "12px",
                                  whiteSpace: "nowrap"
                                }}>
                                  {emailTypeLabels[log.emailType] || log.emailType}
                                </span>
                              </td>
                              <td style={{ fontSize: "13px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }} title={formatRecipient(log.to)}>
                                {formatRecipient(log.to)}
                              </td>
                              <td style={{ fontSize: "13px" }} title={log.subject}>
                                <div style={{ fontWeight: "500", color: "white" }}>{log.subject}</div>
                                {log.requestId && (
                                  <span style={{ fontSize: "10px", color: "var(--accent)" }}>
                                    ID Solicitação: {log.requestId}
                                  </span>
                                )}
                              </td>
                              <td>
                                {log.status === "sent" ? (
                                  <span className="badge confirmed" style={{ whiteSpace: "nowrap" }}>Enviado</span>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <span className="badge rejected" style={{ whiteSpace: "nowrap" }}>Falhou</span>
                                    {log.error && (
                                      <span style={{ fontSize: "10px", color: "#ffa8a8", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis" }} title={log.error}>
                                        {log.error}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  {log.status === "failed" && (
                                    <button 
                                      type="button"
                                      onClick={() => handleResendEmail(log.id)}
                                      className="admin-action-btn btn-approve"
                                      style={{ padding: "6px 10px", fontSize: "11px", gap: "4px", backgroundColor: "#2b8a3e" }}
                                    >
                                      <RefreshCw size={12} />
                                      <span>Reenviar</span>
                                    </button>
                                  )}

                                  {log.requestId && requests.find(r => r.id === log.requestId)?.status === "pending_confirmation" && (
                                    <button 
                                      type="button"
                                      onClick={() => handleConfirmManual(log.requestId)}
                                      className="admin-action-btn btn-approve"
                                      style={{ padding: "6px 10px", fontSize: "11px", gap: "4px", whiteSpace: "nowrap" }}
                                    >
                                      <Check size={12} />
                                      <span>Confirmar Manual</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "announcements" && (
          <div className="tab-pane animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className="section-header">
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Megaphone size={20} style={{ color: "var(--accent)" }} />
                <span>Gerenciador de Avisos e Comunicados</span>
              </h3>
              <p style={{ color: "var(--text-dark-muted)", fontSize: "13px" }}>
                Cadastre avisos importantes que serão exibidos aos operadores de aeronaves como popups obrigatórios ao acessar o painel.
              </p>
            </div>

            {/* Save Form Card */}
            <div className="card" style={{ padding: "20px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-dark)" }}>
              <h4 style={{ color: "var(--text-dark)", marginBottom: "16px", fontSize: "14px", fontWeight: "bold" }}>
                {editingAnnouncementId ? "Editar Comunicado" : "Novo Comunicado"}
              </h4>
              <form onSubmit={handleSaveAnnouncement} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-dark-muted)" }}>TÍTULO DO AVISO:</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: Manutenção Programada de Pista"
                    style={{ width: "100%", padding: "10px", fontSize: "13px" }}
                    value={announcementTitle}
                    onChange={(e) => setAnnouncementTitle(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-dark-muted)" }}>CONTEÚDO DO AVISO:</label>
                  <textarea
                    className="form-input"
                    placeholder="Digite a mensagem detalhada que o operador irá ler..."
                    rows={4}
                    style={{ width: "100%", padding: "10px", fontSize: "13px", resize: "vertical", height: "auto" }}
                    value={announcementContent}
                    onChange={(e) => setAnnouncementContent(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="checkbox"
                    id="announcement_active"
                    checked={announcementActive}
                    onChange={(e) => setAnnouncementActive(e.target.checked)}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                  />
                  <label htmlFor="announcement_active" style={{ fontSize: "12px", color: "var(--text-dark)", cursor: "pointer", fontWeight: "500" }}>
                    Aviso Ativo (será exibido imediatamente aos operadores que não deram ciente)
                  </label>
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                  <button
                    type="submit"
                    className="admin-action-btn btn-approve"
                    style={{ padding: "10px 20px", fontSize: "12.5px" }}
                    disabled={announcementsLoading}
                  >
                    {editingAnnouncementId ? "Salvar Alterações" : "Criar Aviso"}
                  </button>

                  {editingAnnouncementId && (
                    <button
                      type="button"
                      className="admin-action-btn btn-reject"
                      style={{ padding: "10px 20px", fontSize: "12.5px" }}
                      onClick={() => {
                        setAnnouncementTitle("");
                        setAnnouncementContent("");
                        setAnnouncementActive(true);
                        setEditingAnnouncementId(null);
                      }}
                    >
                      Cancelar Edição
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* List of announcements */}
            <div className="section-header" style={{ marginTop: "16px" }}>
              <h4>Avisos Cadastrados</h4>
            </div>

            {announcementsLoading && announcements.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px", color: "var(--text-dark-muted)" }}>
                Carregando avisos...
              </div>
            ) : announcements.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: "30px", color: "var(--text-dark-muted)", background: "rgba(0, 0, 0, 0.1)" }}>
                Nenhum comunicado cadastrado até o momento.
              </div>
            ) : (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th style={{ width: "120px" }}>Criado em</th>
                      <th style={{ width: "90px" }}>Status</th>
                      <th style={{ width: "100px", textAlign: "center" }}>Leituras (Ciente)</th>
                      <th style={{ width: "120px", textAlign: "center" }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {announcements.map((ann) => (
                      <tr key={ann.id}>
                        <td>
                          <div style={{ fontWeight: "600", fontSize: "13px" }}>{ann.title}</div>
                          <div style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "4px", whiteSpace: "pre-line" }}>
                            {ann.content.length > 120 ? ann.content.substring(0, 120) + "..." : ann.content}
                          </div>
                        </td>
                        <td style={{ fontSize: "12px" }}>
                          {new Date(ann.createdAt).toLocaleDateString("pt-BR")}
                        </td>
                        <td>
                          <span className={`badge ${ann.active ? "approved" : "pending"}`} style={{ fontSize: "10px", padding: "3px 6px" }}>
                            {ann.active ? "ATIVO" : "INATIVO"}
                          </span>
                        </td>
                        <td style={{ textAlign: "center", fontWeight: "700" }}>
                          {ann.readBy ? ann.readBy.length : 0}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            <button
                              onClick={() => handleEditAnnouncement(ann)}
                              className="admin-action-btn btn-approve"
                              style={{ padding: "4px 8px", fontSize: "11px", height: "auto" }}
                              title="Editar Comunicado"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteAnnouncement(ann.id)}
                              className="admin-action-btn btn-reject"
                              style={{ padding: "4px 8px", fontSize: "11px", height: "auto" }}
                              title="Excluir Comunicado"
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
