"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
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
  X
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

  // Settings State
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [airportAdminEmail, setAirportAdminEmail] = useState("");
  const [emailSubjectPrefix, setEmailSubjectPrefix] = useState("");
  const [customNotes, setCustomNotes] = useState("");

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
      
    } catch (err) {
      console.error("Admin fetch error:", err);
      setErrorMsg(err.message || "Erro de conexão ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!auth) {
      // Sandbox mode: permit access
      setAuthLoading(false);
      setAuthorized(true);
      fetchData();
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        // Redirect to login if not logged in
        router.push("/login");
      } else {
        const email = currentUser.email || "";
        const lowerEmail = email.toLowerCase();
        
        // Define admin email list: Wilkson, Adriano and test email
        const isAdmin = 
          lowerEmail === "wilkson.carvalho@navbrasil.gov.br" ||
          (lowerEmail.startsWith("adriano.") && lowerEmail.endsWith("@navbrasil.gov.br")) ||
          lowerEmail === "gernavsbiz@gmail.com" ||
          lowerEmail === "developer@sbiz.local";

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
          customNotes
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
              authorizedAt: new Date().toISOString()
            };
          }
          return req;
        }));
        setSuccessMsg(`[SIMULAÇÃO] Solicitação ${decision === "authorized" ? "autorizada" : "recusada"} com sucesso!`);
        setTimeout(() => setSuccessMsg(""), 4000);
        return;
      }

      const response = await fetch("/api/admin/requests/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision })
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

  // Metrics calculations
  const totalCount = requests.length;
  const confirmedCount = requests.filter(r => r.status === "confirmed").length;
  const pendingCount = requests.filter(r => r.status === "pending_confirmation").length;

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
        <button onClick={() => router.push("/dashboard")} className="logout-btn" style={{ color: "white" }}>
          <LayoutGrid size={15} />
          <span>Formulário</span>
        </button>
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
            <span>Configuração de E-mails</span>
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
            </div>

            {/* Search filter input */}
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <div style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: "14px", top: "15px", color: "var(--text-dark-muted)" }} />
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ paddingLeft: "42px" }}
                  placeholder="Pesquisar por ID, empresa, solicitante ou aeronave..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  disabled={loading}
                />
              </div>
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
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Empresa / Operador</th>
                      <th>Solicitante</th>
                      <th>Aeronave</th>
                      <th>Período Solicitado</th>
                      <th>Operador</th>
                      <th>Autorização</th>
                      <th>Assinatura / IP</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map((req) => (
                      <tr key={req.id}>
                        <td style={{ fontFamily: "monospace", fontWeight: "bold", color: "var(--text-dark-muted)" }}>
                          #{req.id.slice(-6).toUpperCase()}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: "white" }}>{req.company?.name}</div>
                          <div style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "2px" }}>
                            CNPJ: {req.company?.taxId}
                          </div>
                        </td>
                        <td>
                          <div>{req.requestor?.name}</div>
                          <div style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "2px" }}>
                            {req.requestor?.role}
                          </div>
                        </td>
                        <td>{req.aircraft?.typeQty}</td>
                        <td style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
                          <div><strong>De:</strong> {new Date(req.period?.start).toLocaleString("pt-BR")}</div>
                          <div style={{ marginTop: "2px" }}><strong>Até:</strong> {new Date(req.period?.end).toLocaleString("pt-BR")}</div>
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
                          {req.status === "confirmed" && (!req.approvalStatus || req.approvalStatus === "pending_analysis") && (
                            <span className="badge badge-info">Em Análise</span>
                          )}
                          {req.status !== "confirmed" && (!req.approvalStatus || req.approvalStatus === "waiting_confirmation") && (
                            <span className="badge badge-warning">Aguardando</span>
                          )}
                        </td>
                        <td style={{ fontSize: "11px", color: "var(--text-dark-muted)" }}>
                          {req.status === "confirmed" ? (
                            <>
                              <div>{new Date(req.confirmedAt).toLocaleString("pt-BR")}</div>
                              <div style={{ fontFamily: "monospace", marginTop: "2px" }}>IP: {req.confirmationIp}</div>
                            </>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.15)" }}>Aguardando link</span>
                          )}
                        </td>
                        <td>
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
                          ) : req.status === "confirmed" ? (
                            <span style={{ fontSize: "11.5px", color: "var(--text-dark-muted)", fontWeight: "500" }}>
                              Finalizado
                            </span>
                          ) : (
                            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.15)" }}>
                              Sem Ações
                            </span>
                          )}
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
                  onChange={e => setAirportAdminEmail(e.target.value)}
                  disabled={settingsLoading || loading}
                  required
                />
                <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", marginTop: "4px", display: "block" }}>
                  E-mails oficiais dos destinatários da NAV Brasil - DNIZ que receberão as solicitações prontas para cobrança (separe múltiplos por vírgula).
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
      </main>
    </>
  );
}
