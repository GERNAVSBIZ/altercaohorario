"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { 
  History, 
  Search, 
  RefreshCw,
  LayoutGrid,
  Check,
  X,
  ShieldCheck,
  FileText,
  User,
  Plane,
  Building2,
  CalendarDays
} from "lucide-react";

export default function OperationalPage() {
  const router = useRouter();
  
  // Auth states
  const [authLoading, setAuthLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  // Data States
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isMock, setIsMock] = useState(false);

  // Edit States
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({
    registration: "",
    periodStart: "",
    periodEnd: "",
    opServedBy: "",
    opBillingStatus: "Não",
    opInvoiceId: "",
    opNacaStatus: "Pendente",
    opNotes: ""
  });

  // Helper to format ISO strings to local datetime-local format YYYY-MM-DDTHH:MM
  const toLocalISOString = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
  };

  const fetchOperationalData = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/requests/operational");
      const data = await res.json();
      if (res.ok) {
        setRequests(data.requests || []);
        setIsMock(data.mock || false);
      } else {
        throw new Error(data.error || "Erro ao buscar dados operacionais.");
      }
    } catch (err) {
      console.error("Fetch operational error:", err);
      setErrorMsg(err.message || "Erro de conexão ao buscar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!auth) {
      // Sandbox mode: permit access
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthLoading(false);
      setAuthorized(true);
      fetchOperationalData();
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        const email = currentUser.email || "";
        const lowerEmail = email.toLowerCase();
        
        let isUserAuthorized = lowerEmail === "wilkson.carvalho@navbrasil.gov.br";

        const isSandbox = !db;
        if (isSandbox) {
          isUserAuthorized = 
            lowerEmail === "wilkson.carvalho@navbrasil.gov.br" ||
            lowerEmail === "gernavsbiz@gmail.com" ||
            lowerEmail === "developer@sbiz.local";
        }
        
        if (!isUserAuthorized && db) {
          try {
            const settingsRes = await fetch("/api/admin/settings");
            if (settingsRes.ok) {
              const settingsData = await settingsRes.json();
              const allowedAdminsStr = settingsData.settings?.adminEmails || "";
              const allowedAdmins = allowedAdminsStr
                .split(/[,;]/)
                .map(e => e.trim().toLowerCase())
                .filter(e => e.length > 0);

              if (allowedAdmins.includes(lowerEmail)) {
                isUserAuthorized = true;
              }
            }
          } catch (settingsErr) {
            console.error("Error reading adminEmails settings:", settingsErr);
          }

          if (!isUserAuthorized) {
            try {
              const profileRef = doc(db, "profiles", currentUser.uid);
              const profileSnap = await getDoc(profileRef);
              if (profileSnap.exists()) {
                const profileData = profileSnap.data();
                if (profileData.role === "admin") {
                  isUserAuthorized = true;
                }
              }
            } catch (profileErr) {
              console.error("Error checking profile role:", profileErr);
            }
          }
        }

        if (isUserAuthorized) {
          setAuthorized(true);
          fetchOperationalData();
        } else {
          setAuthorized(false);
        }
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const handleStartEdit = (req) => {
    setEditingId(req.id);
    setEditFields({
      registration: req.aircraft?.registration || "",
      periodStart: toLocalISOString(req.period?.start),
      periodEnd: toLocalISOString(req.period?.end),
      opServedBy: req.opServedBy || "",
      opBillingStatus: req.opBillingStatus || "Não",
      opInvoiceId: req.opInvoiceId || "",
      opNacaStatus: req.opNacaStatus || "Pendente",
      opNotes: req.opNotes || ""
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (id) => {
    setSuccessMsg("");
    setErrorMsg("");
    setLoading(true);

    try {
      // Validate dates
      if (new Date(editFields.periodStart) >= new Date(editFields.periodEnd)) {
        throw new Error("A data de término deve ser posterior à data de início.");
      }

      const response = await fetch("/api/admin/requests/operational", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          registration: editFields.registration,
          periodStart: new Date(editFields.periodStart).toISOString(),
          periodEnd: new Date(editFields.periodEnd).toISOString(),
          opServedBy: editFields.opServedBy,
          opBillingStatus: editFields.opBillingStatus,
          opInvoiceId: editFields.opInvoiceId,
          opNacaStatus: editFields.opNacaStatus,
          opNotes: editFields.opNotes
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || "Erro ao salvar dados.");

      setSuccessMsg(resData.message || "Dados atualizados com sucesso!");
      setEditingId(null);
      await fetchOperationalData();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Save edit error:", err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  // Filter requests
  const filteredRequests = requests.filter(r => {
    const query = searchQuery.toLowerCase();
    return (
      r.id.toLowerCase().includes(query) ||
      r.company?.name?.toLowerCase().includes(query) ||
      r.aircraft?.registration?.toLowerCase().includes(query) ||
      r.opServedBy?.toLowerCase().includes(query) ||
      r.opInvoiceId?.toLowerCase().includes(query)
    );
  });

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
          <h2 style={{ fontSize: "22px", color: "white", marginBottom: "12px" }}>Acesso Restrito</h2>
          <p style={{ color: "var(--text-dark-muted)", fontSize: "14px", lineHeight: "1.5", marginBottom: "28px" }}>
            Sua conta não possui privilégios de administrador para acessar o Painel Operacional.
          </p>
          <button onClick={() => router.push("/dashboard")} className="btn">
            Ir para o Dashboard
          </button>
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
            background: "#3b82f6", 
            color: "white", 
            padding: "2px 6px", 
            borderRadius: "4px",
            fontWeight: "bold",
            letterSpacing: "0.05em"
          }}>OPERACIONAL</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => router.push("/admin")} className="logout-btn" style={{ color: "white" }}>
            <ShieldCheck size={15} />
            <span>Administração</span>
          </button>
          <button onClick={handleLogout} className="logout-btn">
            Sair
          </button>
        </div>
      </header>

      <main className="container" style={{ minHeight: "auto", padding: "24px 16px 60px 16px", maxWidth: "1200px" }}>
        
        {/* Title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h1 style={{ fontSize: "24px", color: "white" }}>Controle Operacional</h1>
            <p style={{ fontSize: "13px", color: "var(--text-dark-muted)" }}>
              Registro de atendimentos de prorrogações (PNA/OEA), faturamento e envio NACA de solicitações autorizadas.
            </p>
          </div>
          <button 
            onClick={fetchOperationalData} 
            className="admin-action-btn"
            disabled={loading}
            style={{ padding: "8px" }}
            title="Atualizar dados"
          >
            <RefreshCw size={16} className={loading ? "spinner" : ""} />
          </button>
        </div>

        {/* Alerts */}
        {isMock && (
          <div className="notification" style={{ backgroundColor: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.2)", color: "#fef3c7" }}>
            <div>
              <strong>Modo de Simulação Ativo:</strong> Dados operacionais sendo mantidos temporariamente na memória local.
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="notification notification-error">
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="notification notification-success">
            <span>{successMsg}</span>
          </div>
        )}

        {/* Filter Input */}
        <div className="form-group" style={{ marginBottom: "20px" }}>
          <div style={{ position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: "14px", top: "15px", color: "var(--text-dark-muted)" }} />
            <input 
              type="text" 
              className="form-input" 
              style={{ paddingLeft: "42px" }}
              placeholder="Pesquisar por ID, empresa, matrícula, fatura ou operador..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        {/* Data List */}
        {loading && requests.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <span className="spinner" style={{ width: "30px", height: "30px" }}></span>
            <p style={{ marginTop: "12px", color: "var(--text-dark-muted)", fontSize: "14px" }}>Carregando registros operacionais...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "40px" }}>
            <FileText size={36} style={{ color: "var(--text-dark-muted)", margin: "0 auto 12px" }} />
            <h3 style={{ fontSize: "16px", color: "white" }}>Nenhuma prorrogação autorizada encontrada</h3>
            <p style={{ fontSize: "13px", color: "var(--text-dark-muted)", marginTop: "4px" }}>
              Não há solicitações aprovadas com os critérios de busca atuais.
            </p>
          </div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: "90px" }}>ID</th>
                  <th style={{ minWidth: "150px" }}>Empresa Solicitante</th>
                  <th style={{ width: "110px" }}>Matrícula</th>
                  <th style={{ minWidth: "180px" }}>Período Alteração</th>
                  <th style={{ minWidth: "150px" }}>Operador (PNA/OEA)</th>
                  <th style={{ width: "120px" }}>Cobrança Realizada</th>
                  <th style={{ width: "130px" }}>ID Fatura</th>
                  <th style={{ width: "135px" }}>Envio NACA</th>
                  <th style={{ minWidth: "180px" }}>Observações</th>
                  <th style={{ width: "100px" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => {
                  const isEditing = editingId === req.id;
                  
                  return (
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
                      
                      {/* Matrícula */}
                      <td>
                        {isEditing ? (
                          <input 
                            type="text"
                            className="form-input"
                            style={{ padding: "8px", fontSize: "12.5px" }}
                            value={editFields.registration}
                            onChange={e => setEditFields({ ...editFields, registration: e.target.value.toUpperCase() })}
                          />
                        ) : (
                          <span style={{ fontWeight: "bold", color: "var(--accent)" }}>
                            {req.aircraft?.registration || "-"}
                          </span>
                        )}
                      </td>
                      
                      {/* Período Alteração */}
                      <td>
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <div>
                              <span style={{ fontSize: "10px", color: "var(--text-dark-muted)", display: "block" }}>Início:</span>
                              <input 
                                type="datetime-local"
                                className="form-input"
                                style={{ padding: "6px", fontSize: "11px", height: "auto" }}
                                value={editFields.periodStart}
                                onChange={e => setEditFields({ ...editFields, periodStart: e.target.value })}
                              />
                            </div>
                            <div>
                              <span style={{ fontSize: "10px", color: "var(--text-dark-muted)", display: "block" }}>Fim:</span>
                              <input 
                                type="datetime-local"
                                className="form-input"
                                style={{ padding: "6px", fontSize: "11px", height: "auto" }}
                                value={editFields.periodEnd}
                                onChange={e => setEditFields({ ...editFields, periodEnd: e.target.value })}
                              />
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
                            <div><strong>De:</strong> {new Date(req.period?.start).toLocaleString("pt-BR")}</div>
                            <div style={{ marginTop: "2px" }}><strong>Até:</strong> {new Date(req.period?.end).toLocaleString("pt-BR")}</div>
                          </div>
                        )}
                      </td>

                      {/* Operador (PNA/OEA) */}
                      <td>
                        {isEditing ? (
                          <input 
                            type="text"
                            className="form-input"
                            style={{ padding: "8px", fontSize: "12.5px" }}
                            placeholder="Nome / Registro"
                            value={editFields.opServedBy}
                            onChange={e => setEditFields({ ...editFields, opServedBy: e.target.value })}
                          />
                        ) : (
                          <span>{req.opServedBy || <span style={{ color: "var(--text-dark-muted)", fontStyle: "italic" }}>Pendente</span>}</span>
                        )}
                      </td>

                      {/* Cobrança Realizada */}
                      <td>
                        {isEditing ? (
                          <select 
                            className="form-input"
                            style={{ padding: "8px", fontSize: "12.5px", height: "38px" }}
                            value={editFields.opBillingStatus}
                            onChange={e => setEditFields({ ...editFields, opBillingStatus: e.target.value })}
                          >
                            <option value="Sim">Sim</option>
                            <option value="Não">Não</option>
                            <option value="Isento">Isento</option>
                          </select>
                        ) : (
                          <span className={`badge ${
                            req.opBillingStatus === "Sim" ? "badge-success" : 
                            req.opBillingStatus === "Isento" ? "badge-info" : "badge-warning"
                          }`}>
                            {req.opBillingStatus || "Não"}
                          </span>
                        )}
                      </td>

                      {/* ID Fatura */}
                      <td>
                        {isEditing ? (
                          <input 
                            type="text"
                            className="form-input"
                            style={{ padding: "8px", fontSize: "12.5px" }}
                            placeholder="Nº Fatura"
                            value={editFields.opInvoiceId}
                            onChange={e => setEditFields({ ...editFields, opInvoiceId: e.target.value })}
                          />
                        ) : (
                          <span>{req.opInvoiceId || <span style={{ color: "var(--text-dark-muted)", fontStyle: "italic" }}>Pendente</span>}</span>
                        )}
                      </td>

                      {/* Envio NACA */}
                      <td>
                        {isEditing ? (
                          <select 
                            className="form-input"
                            style={{ padding: "8px", fontSize: "12.5px", height: "38px" }}
                            value={editFields.opNacaStatus}
                            onChange={e => setEditFields({ ...editFields, opNacaStatus: e.target.value })}
                          >
                            <option value="Pendente">Pendente</option>
                            <option value="Enviado">Enviado</option>
                            <option value="Não Aplicável">Não Aplicável</option>
                          </select>
                        ) : (
                          <span className={`badge ${
                            req.opNacaStatus === "Enviado" ? "badge-success" : 
                            req.opNacaStatus === "Não Aplicável" ? "badge-info" : "badge-warning"
                          }`}>
                            {req.opNacaStatus || "Pendente"}
                          </span>
                        )}
                      </td>

                      {/* Observações */}
                      <td>
                        {isEditing ? (
                          <textarea 
                            className="form-input"
                            style={{ padding: "8px", fontSize: "12px", minHeight: "60px", resize: "vertical" }}
                            placeholder="Observações operacionais..."
                            value={editFields.opNotes}
                            onChange={e => setEditFields({ ...editFields, opNotes: e.target.value })}
                          />
                        ) : (
                          <span style={{ fontSize: "12px", color: req.opNotes ? "var(--text-dark)" : "var(--text-dark-muted)" }}>
                            {req.opNotes || <span style={{ fontStyle: "italic" }}>Sem observações</span>}
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button 
                              onClick={() => handleSaveEdit(req.id)}
                              className="admin-action-btn btn-approve"
                              style={{ padding: "6px" }}
                              disabled={loading}
                              title="Salvar alterações"
                            >
                              <Check size={14} />
                            </button>
                            <button 
                              onClick={handleCancelEdit}
                              className="admin-action-btn btn-reject"
                              style={{ padding: "6px" }}
                              disabled={loading}
                              title="Cancelar edição"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => handleStartEdit(req)}
                            className="admin-action-btn"
                            style={{ padding: "6px 12px", fontSize: "12px" }}
                            disabled={loading}
                          >
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
