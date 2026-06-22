"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { 
  Building2, 
  User, 
  PlaneTakeoff, 
  CalendarDays, 
  FileText, 
  LogOut, 
  Send, 
  ChevronDown, 
  ChevronUp, 
  CircleAlert,
  CheckCircle2,
  History,
  RefreshCw,
  ShieldCheck,
  Clock
} from "lucide-react";

// Helper to format ISO strings to Brasília local datetime-local format YYYY-MM-DDTHH:MM
const toBrasiliaISOString = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  const brOffsetMs = -3 * 60 * 60 * 1000;
  const brDate = new Date(date.getTime() + brOffsetMs);
  return brDate.toISOString().slice(0, 16);
};

// Helper to parse local datetime-local string (YYYY-MM-DDTHH:MM) strictly as Brasília time (UTC-3)
const parseBrasiliaDate = (localISOString) => {
  if (!localISOString) return null;
  if (localISOString.includes("Z") || /[-+]\d{2}:\d{2}$/.test(localISOString)) {
    return new Date(localISOString);
  }
  return new Date(localISOString + "-03:00");
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Tabs System & History states
  const [activeTab, setActiveTab] = useState("new_request"); // "new_request" | "my_requests"
  const [userRequests, setUserRequests] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [editingRequestId, setEditingRequestId] = useState(null);
  const [editingRequestCreatedAt, setEditingRequestCreatedAt] = useState(null);

  // Accordion active sections state
  const [openSections, setOpenSections] = useState({
    company: true,
    operator: true,
    flight: true,
    period: true
  });

  // Form Fields State
  const [companyName, setCompanyName] = useState("");
  const [companyTaxId, setCompanyTaxId] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  const [aircraftOperator, setAircraftOperator] = useState("");
  const [aircraftRegistration, setAircraftRegistration] = useState("");
  const [requestorName, setRequestorName] = useState("");
  const [requestorRole, setRequestorRole] = useState("");
  const [requestorBillingEmail, setRequestorBillingEmail] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [pilotName, setPilotName] = useState("");
  const [pilotAnac, setPilotAnac] = useState("");
  const [aircraftTypeQty, setAircraftTypeQty] = useState("");

  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [intentionDecolagem, setIntentionDecolagem] = useState(false);
  const [intentionPouso, setIntentionPouso] = useState(false);
  const [intentionAlternativa, setIntentionAlternativa] = useState(false);
  const [notes, setNotes] = useState("");

  // Load operator request history
  const fetchUserRequests = async () => {
    if (!user) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const headers = { "Content-Type": "application/json" };
      if (auth && auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        headers["Authorization"] = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/requests?userId=${user.uid}`, {
        method: "GET",
        headers
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao buscar histórico");
      }
      
      let fetchedRequests = data.requests || [];
      
      // Sandbox mode support: retrieve from local storage and merge
      if (data.mock || user.isMock) {
        const localMocks = JSON.parse(localStorage.getItem("mock_requests") || "[]");
        const merged = [...localMocks];
        fetchedRequests.forEach(req => {
          if (!merged.some(m => m.id === req.id)) {
            merged.push(req);
          }
        });
        fetchedRequests = merged;
      }
      
      setUserRequests(fetchedRequests);
    } catch (err) {
      console.error("Fetch requests history error:", err);
      setHistoryError(err.message || "Não foi possível carregar o histórico.");
    } finally {
      setHistoryLoading(false);
    }
  };

  // Fetch history when user changes or tab changes
  useEffect(() => {
    if (activeTab === "my_requests" && user) {
      fetchUserRequests();
    }
  }, [activeTab, user]);

  // Verify auth state and load user profile from Firestore
  useEffect(() => {
    if (!auth) {
      // Firebase not configured - running in sandbox/mock mode
      setAuthLoading(false);
      setUser({ email: "developer@sbiz.local", uid: "mock-user-123", isMock: true });
      setIsAdmin(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        setUser(currentUser);
        
        // 1. Initial admin check based on email
        const lowerEmail = (currentUser.email || "").toLowerCase();
        let userIsAdmin = lowerEmail === "wilkson.carvalho@navbrasil.gov.br";

        // Load profile from Firestore
        if (db) {
          try {
            const profileRef = doc(db, "profiles", currentUser.uid);
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
              const data = profileSnap.data();
              setCompanyName(data.companyName || "");
              setCompanyTaxId(data.companyTaxId || "");
              setCompanyEmail(data.companyEmail || currentUser.email || "");
              setCompanyPhone(data.companyPhone || "");
              setCompanyAddress(data.companyAddress || "");
              setAircraftOperator(data.aircraftOperator || "");
              setAircraftRegistration(data.aircraftRegistration || "");
              setRequestorName(data.requestorName || "");
              setRequestorRole(data.requestorRole || "");
              setRequestorBillingEmail(data.requestorBillingEmail || "");
              setPilotName(data.pilotName || "");
              setPilotAnac(data.pilotAnac || "");
              setAircraftTypeQty(data.aircraftTypeQty || "");

              if (data.role === "admin") {
                userIsAdmin = true;
              }
            } else {
              // Pre-fill email with authenticated user email
              setCompanyEmail(currentUser.email || "");
            }

            // Check config settings for admin emails by querying the server-side settings API
            if (!userIsAdmin) {
              const settingsRes = await fetch("/api/admin/settings");
              if (settingsRes.ok) {
                const settingsData = await settingsRes.json();
                const allowedAdminsStr = settingsData.settings?.adminEmails || "";
                const allowedAdmins = allowedAdminsStr
                  .split(/[,;]/)
                  .map(e => e.trim().toLowerCase())
                  .filter(e => e.length > 0);
                if (allowedAdmins.includes(lowerEmail)) {
                  userIsAdmin = true;
                }
              }
            }
          } catch (err) {
            console.error("Error loading profile:", err);
          }
        } else {
          // Sandbox mode fallbacks
          userIsAdmin = 
            lowerEmail === "wilkson.carvalho@navbrasil.gov.br" ||
            lowerEmail === "gernavsbiz@gmail.com" ||
            lowerEmail === "developer@sbiz.local";
        }

        setIsAdmin(userIsAdmin);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const toggleSection = (section) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleStartEditRequest = (req) => {
    setEditingRequestId(req.id);
    setEditingRequestCreatedAt(req.createdAt || new Date().toISOString());

    // Populate all form fields
    setCompanyName(req.company?.name || "");
    setCompanyTaxId(req.company?.taxId || "");
    setCompanyEmail(req.company?.email || "");
    setCompanyPhone(req.company?.phone || "");
    setCompanyAddress(req.company?.address || "");

    setAircraftOperator(req.aircraft?.operator || "");
    setAircraftRegistration(req.aircraft?.registration || "");
    setRequestorName(req.requestor?.name || "");
    setRequestorRole(req.requestor?.role || "");
    setRequestorBillingEmail(req.requestor?.billingEmail || "");
    setServiceType(req.serviceType || "");

    setPilotName(req.pilot?.name || "");
    setPilotAnac(req.pilot?.anacCode || "");
    setAircraftTypeQty(req.aircraft?.typeQty || "");

    setPeriodStart(toBrasiliaISOString(req.period?.start));
    setPeriodEnd(toBrasiliaISOString(req.period?.end));
    
    setIntentionDecolagem(!!req.intentions?.decolagem);
    setIntentionPouso(!!req.intentions?.pouso);
    setIntentionAlternativa(!!req.intentions?.alternativa);
    
    setNotes(req.notes || "");

    // Expand all accordion sections to ensure they are visible
    setOpenSections({
      company: true,
      operator: true,
      flight: true,
      period: true
    });

    // Change tab to form
    setActiveTab("new_request");
    
    // Scroll to form top
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEditRequest = () => {
    setEditingRequestId(null);
    setEditingRequestCreatedAt(null);
    
    // Clear form notes, dates and intentions
    setPeriodStart("");
    setPeriodEnd("");
    setNotes("");
    setIntentionDecolagem(false);
    setIntentionPouso(false);
    setIntentionAlternativa(false);
  };

  const handleLogout = async () => {
    if (user?.isMock || !auth) {
      router.push("/login");
      return;
    }
    try {
      await signOut(auth);
      router.push("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSubmitLoading(true);

    // Validation checks
    if (!companyName || !companyTaxId || !companyEmail || !companyPhone || !companyAddress) {
      setErrorMsg("Por favor, preencha todos os dados da empresa.");
      setOpenSections(prev => ({ ...prev, company: true }));
      setSubmitLoading(false);
      return;
    }

    if (!aircraftOperator || !requestorName || !requestorRole || !requestorBillingEmail || !serviceType) {
      setErrorMsg("Por favor, preencha os dados do solicitante, operador e e-mail de faturamento.");
      setOpenSections(prev => ({ ...prev, operator: true }));
      setSubmitLoading(false);
      return;
    }

    if (!aircraftTypeQty || !aircraftRegistration || !pilotName || !pilotAnac) {
      setErrorMsg("Por favor, preencha a identificação da aeronave, matrícula e dados do piloto.");
      setOpenSections(prev => ({ ...prev, flight: true }));
      setSubmitLoading(false);
      return;
    }

    if (!intentionDecolagem && !intentionPouso && !intentionAlternativa) {
      setErrorMsg("Por favor, selecione pelo menos uma Intenção de Voo (Decolagem, Pouso ou Alternativa).");
      setOpenSections(prev => ({ ...prev, period: true }));
      setSubmitLoading(false);
      return;
    }

    if (!periodStart || !periodEnd) {
      setErrorMsg("Por favor, preencha o período solicitado.");
      setOpenSections(prev => ({ ...prev, period: true }));
      setSubmitLoading(false);
      return;
    }

    if (parseBrasiliaDate(periodStart) >= parseBrasiliaDate(periodEnd)) {
      setErrorMsg("A data/hora de término deve ser após a data/hora de início.");
      setOpenSections(prev => ({ ...prev, period: true }));
      setSubmitLoading(false);
      return;
    }

    // Save profile for future requests (Firestore persistence)
    const profileData = {
      companyName,
      companyTaxId,
      companyEmail,
      companyPhone,
      companyAddress,
      aircraftOperator,
      aircraftRegistration,
      requestorName,
      requestorRole,
      requestorBillingEmail,
      pilotName,
      pilotAnac,
      aircraftTypeQty,
      updatedAt: new Date().toISOString()
    };

    if (db && user && !user.isMock) {
      try {
        await setDoc(doc(db, "profiles", user.uid), profileData);
      } catch (err) {
        console.error("Error saving profile details:", err);
      }
    }

    // Prepare API request payload
    const requestPayload = {
      id: editingRequestId,
      createdAt: editingRequestCreatedAt,
      userId: user ? user.uid : "mock-user",
      isMock: user?.isMock || false,
      company: {
        name: companyName,
        taxId: companyTaxId,
        email: companyEmail,
        phone: companyPhone,
        address: companyAddress
      },
      aircraft: {
        operator: aircraftOperator,
        typeQty: aircraftTypeQty,
        registration: aircraftRegistration
      },
      requestor: {
        name: requestorName,
        role: requestorRole,
        billingEmail: requestorBillingEmail
      },
      pilot: {
        name: pilotName,
        anacCode: pilotAnac
      },
      serviceType,
      period: {
        start: parseBrasiliaDate(periodStart).toISOString(),
        end: parseBrasiliaDate(periodEnd).toISOString()
      },
      intentions: {
        decolagem: intentionDecolagem,
        pouso: intentionPouso,
        alternativa: intentionAlternativa
      },
      notes
    };

    try {
      // Send token in authorization header if logged in via Firebase
      const headers = { "Content-Type": "application/json" };
      if (auth && auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("/api/requests", {
        method: "POST",
        headers,
        body: JSON.stringify(requestPayload)
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || "Erro ao registrar solicitação");
      }

      // If in sandbox mode, save/update in localStorage to persist user history
      if (user?.isMock || responseData.mock) {
        const existingMock = JSON.parse(localStorage.getItem("mock_requests") || "[]");
        if (editingRequestId) {
          const updatedMock = existingMock.map(m => m.id === editingRequestId ? {
            ...m,
            status: "pending_confirmation",
            approvalStatus: "waiting_confirmation",
            company: requestPayload.company,
            aircraft: requestPayload.aircraft,
            requestor: requestPayload.requestor,
            pilot: requestPayload.pilot,
            serviceType: requestPayload.serviceType,
            period: requestPayload.period,
            intentions: requestPayload.intentions,
            notes: requestPayload.notes,
            updatedAt: new Date().toISOString()
          } : m);
          localStorage.setItem("mock_requests", JSON.stringify(updatedMock));
        } else {
          const newMockReq = {
            id: responseData.requestId || `req_${Math.random().toString(36).substr(2, 9)}`,
            status: "pending_confirmation",
            approvalStatus: "waiting_confirmation",
            createdAt: new Date().toISOString(),
            company: requestPayload.company,
            aircraft: requestPayload.aircraft,
            requestor: requestPayload.requestor,
            pilot: requestPayload.pilot,
            serviceType: requestPayload.serviceType,
            period: requestPayload.period,
            intentions: requestPayload.intentions,
            notes: requestPayload.notes
          };
          localStorage.setItem("mock_requests", JSON.stringify([newMockReq, ...existingMock]));
        }
      }

      if (editingRequestId) {
        setSuccessMsg("Solicitação atualizada com sucesso! Um novo e-mail de dupla confirmação foi enviado para validar suas alterações.");
      } else {
        setSuccessMsg("Solicitação pré-registrada! Verifique seu e-mail para confirmar a prorrogação.");
      }

      // Clear form notes, dates and intentions
      setPeriodStart("");
      setPeriodEnd("");
      setNotes("");
      setIntentionDecolagem(false);
      setIntentionPouso(false);
      setIntentionAlternativa(false);
      setEditingRequestId(null);
      setEditingRequestCreatedAt(null);
      
      // Automatically redirect to the requests history tab to show the pending item
      setActiveTab("my_requests");
      
      // Refresh requests history list
      fetchUserRequests();

      // Scroll to top to see confirmation message
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Submit request error:", err);
      setErrorMsg(err.message || "Erro no servidor ao processar solicitação.");
    } finally {
      setSubmitLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="container" style={{ justifyContent: "center", alignItems: "center" }}>
        <span className="spinner" style={{ width: "40px", height: "40px" }}></span>
        <p style={{ marginTop: "16px", color: "var(--text-dark-muted)" }}>Carregando painel...</p>
      </div>
    );
  }

  return (
    <>
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <PlaneTakeoff size={20} style={{ color: "var(--accent)", transform: "rotate(45deg)" }} />
          <span style={{ fontWeight: 800, fontSize: "16px", fontFamily: "var(--font-sans)" }}>SBIZ NAVMANAGER</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {isAdmin && (
            <>
              <button 
                type="button"
                onClick={() => router.push("/operacional")} 
                className="logout-btn" 
                style={{ color: "#3b82f6", borderColor: "rgba(59, 130, 246, 0.2)", backgroundColor: "rgba(59, 130, 246, 0.05)", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <History size={16} />
                <span>Operacional</span>
              </button>
              <button 
                type="button"
                onClick={() => router.push("/admin")} 
                className="logout-btn" 
                style={{ color: "var(--accent)", borderColor: "rgba(239, 91, 37, 0.2)", backgroundColor: "rgba(239, 91, 37, 0.05)", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <ShieldCheck size={16} />
                <span>Painel Admin</span>
              </button>
            </>
          )}
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={16} />
            <span>Sair</span>
          </button>
        </div>
      </header>

      <main className="container" style={{ minHeight: "auto", padding: "16px 0 60px 0" }}>
        <div style={{ padding: "0 16px", width: "100%" }}>
          <div style={{ marginBottom: "20px" }}>
            <h1 style={{ fontSize: "22px", color: "var(--text-dark)" }}>
              {activeTab === "new_request" ? "Solicitar Prorrogação" : "Histórico de Solicitações"}
            </h1>
            <p style={{ fontSize: "13px", color: "var(--text-dark-muted)", marginTop: "4px" }}>
              {activeTab === "new_request" 
                ? "Preencha os dados operacionais abaixo. Eles serão salvos como seu modelo para facilitar próximos voos."
                : "Acompanhe abaixo o status de confirmação e autorização de seus voos."}
            </p>
          </div>

          {/* Tabs Navigation */}
          <div className="tabs-header" style={{ marginBottom: "20px" }}>
            <button 
              type="button"
              className={`tab-btn ${activeTab === "new_request" ? "active" : ""}`}
              onClick={() => setActiveTab("new_request")}
            >
              <Send size={16} />
              <span>Nova Solicitação</span>
            </button>
            <button 
              type="button"
              className={`tab-btn ${activeTab === "my_requests" ? "active" : ""}`}
              onClick={() => setActiveTab("my_requests")}
            >
              <History size={16} />
              <span>Minhas Solicitações</span>
            </button>
          </div>

          {user?.isMock && activeTab === "new_request" && (
            <div className="notification" style={{ backgroundColor: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.2)", color: "#fef3c7" }}>
              <CircleAlert size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Modo Simulação:</strong> As credenciais do Firebase não estão configuradas localmente. Você pode preencher e testar o formulário; os dados do PDF serão simulados e os e-mails serão gerados no console.
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="notification notification-error">
              <CircleAlert size={18} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="notification notification-success">
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === "new_request" ? (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              
              {editingRequestId && (
                <div className="notification notification-info" style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Clock size={16} />
                    <span>
                      Você está editando a solicitação <strong>#{editingRequestId.slice(-6).toUpperCase()}</strong>. O envio revalidará as informações e exigirá nova dupla confirmação.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelEditRequest}
                    className="admin-action-btn"
                    style={{ padding: "4px 8px", fontSize: "11px", borderColor: "rgba(255,255,255,0.2)", color: "white" }}
                  >
                    Cancelar Edição
                  </button>
                </div>
              )}
              
              {/* SECTION 1: DADOS DA EMPRESA */}
              <div className="accordion">
                <div className="accordion-header" onClick={() => toggleSection("company")}>
                  <div className="accordion-title">
                    <Building2 className="accordion-title-icon" size={18} />
                    <span>1. Dados da Empresa Solicitante</span>
                  </div>
                  {openSections.company ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                
                {openSections.company && (
                  <div className="accordion-content">
                    <div className="form-group">
                      <label className="form-label">Nome / Razão Social</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Empresa Aérea Ltda"
                        value={companyName}
                        onChange={e => setCompanyName(e.target.value)}
                        disabled={submitLoading}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">CNPJ / CPF</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="00.000.000/0000-00"
                        value={companyTaxId}
                        onChange={e => setCompanyTaxId(e.target.value)}
                        disabled={submitLoading}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">E-mail de Contato</label>
                      <input 
                        type="email" 
                        className="form-input" 
                        placeholder="contato@empresa.com"
                        value={companyEmail}
                        onChange={e => setCompanyEmail(e.target.value)}
                        disabled={submitLoading}
                        required
                      />
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Telefone</label>
                        <input 
                          type="tel" 
                          className="form-input" 
                          placeholder="(99) 99999-9999"
                          value={companyPhone}
                          onChange={e => setCompanyPhone(e.target.value)}
                          disabled={submitLoading}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Endereço</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Rua, Número, Bairro"
                          value={companyAddress}
                          onChange={e => setCompanyAddress(e.target.value)}
                          disabled={submitLoading}
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 2: OPERADOR E SOLICITANTE */}
              <div className="accordion">
                <div className="accordion-header" onClick={() => toggleSection("operator")}>
                  <div className="accordion-title">
                    <User className="accordion-title-icon" size={18} />
                    <span>2. Solicitante & Operador</span>
                  </div>
                  {openSections.operator ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>

                {openSections.operator && (
                  <div className="accordion-content">
                    <div className="form-group">
                      <label className="form-label">Operador da Aeronave</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Nome do operador / proprietário"
                        value={aircraftOperator}
                        onChange={e => setAircraftOperator(e.target.value)}
                        disabled={submitLoading}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Nome do Solicitante</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Nome completo de quem preenche"
                        value={requestorName}
                        onChange={e => setRequestorName(e.target.value)}
                        disabled={submitLoading}
                        required
                      />
                    </div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Função</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Ex: Piloto, Despachante"
                          value={requestorRole}
                          onChange={e => setRequestorRole(e.target.value)}
                          disabled={submitLoading}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">E-mail de Faturamento</label>
                        <input 
                          type="email" 
                          className="form-input" 
                          placeholder="financeiro@empresa.com"
                          value={requestorBillingEmail}
                          onChange={e => setRequestorBillingEmail(e.target.value)}
                          disabled={submitLoading}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Espécie do Serviço</label>
                      <select 
                        className="form-input" 
                        style={{ height: "51.5px", padding: "0 16px" }}
                        value={serviceType}
                        onChange={e => setServiceType(e.target.value)}
                        disabled={submitLoading}
                        required
                      >
                        <option value="">Selecione...</option>
                        <option value="Regular (Passageiros)">Regular (Passageiros)</option>
                        <option value="Não-Regular (Fretamento)">Não-Regular (Fretamento)</option>
                        <option value="Geral (Executiva)">Geral (Executiva)</option>
                        <option value="Carga Aérea">Carga Aérea</option>
                        <option value="Serviço de Saúde (AeroMédico)">Serviço de Saúde (AeroMédico)</option>
                        <option value="Outro (Operação Militar / Estado)">Outro</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: TRIPULAÇÃO E AERONAVE */}
              <div className="accordion">
                <div className="accordion-header" onClick={() => toggleSection("flight")}>
                  <div className="accordion-title">
                    <PlaneTakeoff className="accordion-title-icon" size={18} />
                    <span>3. Aeronave & Piloto</span>
                  </div>
                  {openSections.flight ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>

                {openSections.flight && (
                  <div className="accordion-content">
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Identificação da Aeronave (Tipo/Qtd)</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Ex: C208 / 1, B738 / 1"
                          value={aircraftTypeQty}
                          onChange={e => setAircraftTypeQty(e.target.value)}
                          disabled={submitLoading}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Matrícula da Aeronave</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Ex: PT-XYZ, PS-ABC"
                          value={aircraftRegistration}
                          onChange={e => setAircraftRegistration(e.target.value.toUpperCase())}
                          disabled={submitLoading}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Nome do Piloto em Comando</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Nome completo do piloto"
                        value={pilotName}
                        onChange={e => setPilotName(e.target.value)}
                        disabled={submitLoading}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Código ANAC do Piloto</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Ex: 123456"
                        value={pilotAnac}
                        onChange={e => setPilotAnac(e.target.value)}
                        disabled={submitLoading}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 4: PERÍODO E OBSERVAÇÕES */}
              <div className="accordion">
                <div className="accordion-header" onClick={() => toggleSection("period")}>
                  <div className="accordion-title">
                    <CalendarDays className="accordion-title-icon" size={18} />
                    <span>4. Período & Observações</span>
                  </div>
                  {openSections.period ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>

                {openSections.period && (
                  <div className="accordion-content">
                    <div className="form-group" style={{ marginBottom: "16px" }}>
                      <label className="form-label" style={{ display: "block", marginBottom: "8px" }}>Intenção de Voo (Selecione todas que se aplicam)</label>
                      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginTop: "6px" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px" }}>
                          <input 
                            type="checkbox" 
                            style={{ width: "18px", height: "18px", accentColor: "var(--accent)" }}
                            checked={intentionDecolagem}
                            onChange={e => setIntentionDecolagem(e.target.checked)}
                            disabled={submitLoading}
                          />
                          <span>Decolagem</span>
                        </label>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px" }}>
                          <input 
                            type="checkbox" 
                            style={{ width: "18px", height: "18px", accentColor: "var(--accent)" }}
                            checked={intentionPouso}
                            onChange={e => setIntentionPouso(e.target.checked)}
                            disabled={submitLoading}
                          />
                          <span>Pouso</span>
                        </label>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px" }}>
                          <input 
                            type="checkbox" 
                            style={{ width: "18px", height: "18px", accentColor: "var(--accent)" }}
                            checked={intentionAlternativa}
                            onChange={e => setIntentionAlternativa(e.target.checked)}
                            disabled={submitLoading}
                          />
                          <span>Alternativa</span>
                        </label>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Data e Hora de Início (Horário Local de Brasília)</label>
                      <input 
                        type="datetime-local" 
                        className="form-input" 
                        value={periodStart}
                        onChange={e => setPeriodStart(e.target.value)}
                        disabled={submitLoading}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Data e Hora de Fim (Horário Local de Brasília)</label>
                      <input 
                        type="datetime-local" 
                        className="form-input" 
                        value={periodEnd}
                        onChange={e => setPeriodEnd(e.target.value)}
                        disabled={submitLoading}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Observações Adicionais</label>
                      <textarea 
                        className="form-input" 
                        style={{ minHeight: "100px", resize: "vertical" }}
                        placeholder="Descreva detalhes como escala, motivos operacionais da solicitação..."
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        disabled={submitLoading}
                      />
                    </div>
                  </div>
                )}
              </div>

              <button 
                type="submit" 
                className="btn" 
                disabled={submitLoading}
                style={{ marginTop: "12px", gap: "10px" }}
              >
                {submitLoading ? (
                  <span className="spinner"></span>
                ) : (
                  <>
                    <Send size={18} />
                    {editingRequestId ? "Salvar Alterações e Revalidar" : "Enviar Pré-Solicitação"}
                  </>
                )}
              </button>
            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", animation: "fadeIn 0.3s ease-out" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span style={{ fontSize: "13px", color: "var(--text-dark-muted)" }}>
                  Suas solicitações registradas no sistema
                </span>
                <button 
                  type="button"
                  onClick={fetchUserRequests}
                  className="admin-action-btn"
                  style={{ padding: "6px" }}
                  disabled={historyLoading}
                  title="Atualizar histórico"
                >
                  <RefreshCw size={14} className={historyLoading ? "spinner" : ""} />
                </button>
              </div>

              {historyLoading ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <span className="spinner" style={{ width: "24px", height: "24px" }}></span>
                  <p style={{ marginTop: "12px", color: "var(--text-dark-muted)", fontSize: "13px" }}>Buscando solicitações...</p>
                </div>
              ) : historyError ? (
                <div className="notification notification-error">
                  <CircleAlert size={16} />
                  <span>{historyError}</span>
                </div>
              ) : userRequests.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "40px", backgroundColor: "rgba(255, 255, 255, 0.01)" }}>
                  <Clock size={36} style={{ color: "var(--text-dark-muted)", margin: "0 auto 12px" }} />
                  <h3 style={{ fontSize: "15px", color: "white" }}>Nenhuma solicitação</h3>
                  <p style={{ fontSize: "12px", color: "var(--text-dark-muted)", marginTop: "4px" }}>
                    Você ainda não realizou nenhuma solicitação de prorrogação de horário.
                  </p>
                </div>
              ) : (
                userRequests.map((req) => (
                  <div 
                    key={req.id} 
                    className="card" 
                    style={{ 
                      padding: "16px", 
                      borderRadius: "var(--border-radius-sm)", 
                      border: "1px solid var(--border-dark)",
                      backgroundColor: "rgba(255, 255, 255, 0.01)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-dark)", paddingBottom: "8px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: "bold", color: "var(--text-dark-muted)" }}>
                        #{req.id.slice(-6).toUpperCase()}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-dark-muted)" }}>
                        {new Date(req.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
                      <div><strong>Empresa:</strong> {req.company?.name}</div>
                      <div><strong>Aeronave:</strong> {req.aircraft?.typeQty}</div>
                      <div><strong>Período:</strong></div>
                      <div style={{ paddingLeft: "10px", fontSize: "12px", color: "var(--text-dark-muted)" }}>
                        De {new Date(req.period?.start).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}<br />
                        Até {new Date(req.period?.end).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </div>
                    </div>

                    <div style={{ 
                      display: "grid", 
                      gridTemplateColumns: "1fr 1fr", 
                      gap: "8px", 
                      borderTop: "1px solid var(--border-dark)", 
                      paddingTop: "8px",
                      marginTop: "4px"
                    }}>
                      <div>
                        <div style={{ fontSize: "10px", color: "var(--text-dark-muted)", textTransform: "uppercase", marginBottom: "2px" }}>E-mail (Operador)</div>
                        {req.status === "confirmed" ? (
                          <span className="badge badge-success" style={{ width: "100%", fontSize: "10px", padding: "2px 6px" }}>Confirmado</span>
                        ) : (
                          <span className="badge badge-warning" style={{ width: "100%", fontSize: "10px", padding: "2px 6px" }}>Pendente</span>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: "10px", color: "var(--text-dark-muted)", textTransform: "uppercase", marginBottom: "2px" }}>Autorização (Admin)</div>
                        {req.approvalStatus === "authorized" && (
                          <span className="badge badge-success" style={{ width: "100%", fontSize: "10px", padding: "2px 6px" }}>Autorizado</span>
                        )}
                        {req.approvalStatus === "not_authorized" && (
                          <span className="badge badge-danger" style={{ width: "100%", fontSize: "10px", padding: "2px 6px" }}>Recusado</span>
                        )}
                        {req.status === "confirmed" && (!req.approvalStatus || req.approvalStatus === "pending_analysis") && (
                          <span className="badge badge-info" style={{ width: "100%", fontSize: "10px", padding: "2px 6px" }}>Em Análise</span>
                        )}
                        {req.status !== "confirmed" && (!req.approvalStatus || req.approvalStatus === "waiting_confirmation") && (
                          <span className="badge badge-warning" style={{ width: "100%", fontSize: "10px", padding: "2px 6px" }}>Aguardando</span>
                        )}
                      </div>
                    </div>

                    {req.status === "pending_confirmation" && (
                      <div style={{ 
                        marginTop: "4px", 
                        padding: "8px", 
                        backgroundColor: "rgba(245, 158, 11, 0.05)", 
                        border: "1px dashed rgba(245, 158, 11, 0.2)",
                        borderRadius: "4px",
                        fontSize: "11px",
                        color: "#fbbf24",
                        textAlign: "center"
                      }}>
                        Verifique seu e-mail para confirmar a solicitação!
                      </div>
                    )}

                    <div style={{ 
                      display: "flex", 
                      justifyContent: "flex-end", 
                      gap: "8px", 
                      borderTop: "1px dashed var(--border-dark)", 
                      paddingTop: "10px",
                      marginTop: "4px"
                    }}>
                      <button
                        type="button"
                        onClick={() => handleStartEditRequest(req)}
                        className="admin-action-btn"
                        style={{ 
                          padding: "6px 12px", 
                          fontSize: "12px", 
                          display: "inline-flex", 
                          alignItems: "center", 
                          gap: "4px",
                          borderColor: "var(--accent)",
                          color: "white" 
                        }}
                      >
                        <RefreshCw size={12} />
                        Solicitar Alteração / Editar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
