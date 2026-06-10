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
  CalendarDays,
  Download
} from "lucide-react";

// Helper to construct a boundary Date strictly in Brasília time (UTC-3)
const getBrasiliaBoundary = (dateObj, hour, minute) => {
  if (!dateObj || isNaN(dateObj.getTime())) return null;
  const brOffsetMs = -3 * 60 * 60 * 1000;
  const brDate = new Date(dateObj.getTime() + brOffsetMs);
  const datePart = brDate.toISOString().slice(0, 10); // YYYY-MM-DD
  const hourStr = hour.toString().padStart(2, '0');
  const minStr = minute.toString().padStart(2, '0');
  return new Date(`${datePart}T${hourStr}:${minStr}:00-03:00`);
};

// Helper to calculate actual attendance duration, anticipation, and extension based on operator shift boundaries (00:00 - 17:50)
const renderAttendanceDetails = (req) => {
  const reqStart = new Date(req.period?.start);
  const reqEnd = new Date(req.period?.end);
  
  // Default actual times to requested times if not explicitly set
  const actStart = new Date(req.opPeriodStart || req.period?.start);
  const actEnd = new Date(req.opPeriodEnd || req.period?.end);

  if (isNaN(reqStart.getTime()) || isNaN(reqEnd.getTime()) || isNaN(actStart.getTime()) || isNaN(actEnd.getTime())) {
    return <span style={{ color: "var(--text-dark-muted)" }}>-</span>;
  }

  const durationMin = Math.round((actEnd - actStart) / 60000);
  const durationHours = Math.floor(durationMin / 60);
  const durationMinsLeft = durationMin % 60;

  // Shift Limits: 00:00 and 17:50 local time on the day of the flight, in Brasília time (UTC-3)
  const shiftStartLimit = getBrasiliaBoundary(reqStart, 0, 0);
  const shiftEndLimit = getBrasiliaBoundary(reqEnd, 17, 50);

  // Antecipação (only if actual start is before operator shift start at 00:00 LOCAL)
  let antMin = 0;
  if (shiftStartLimit && actStart < shiftStartLimit) {
    const antEnd = actEnd < shiftStartLimit ? actEnd : shiftStartLimit;
    antMin = Math.max(0, Math.round((antEnd - actStart) / 60000));
  }

  // Prorrogação (only if actual end is after operator shift end at 17:50 LOCAL)
  let prorMin = 0;
  if (shiftEndLimit && actEnd > shiftEndLimit) {
    const prorStart = actStart > shiftEndLimit ? actStart : shiftEndLimit;
    prorMin = Math.max(0, Math.round((actEnd - prorStart) / 60000));
  }

  return (
    <div style={{ fontSize: "12px", lineHeight: "1.4" }}>
      <div>
        <strong>Duração:</strong> {durationHours}h {durationMinsLeft}m
      </div>
      {antMin > 0 && (
        <div style={{ color: "#3b82f6", fontSize: "11.5px", marginTop: "2px", fontWeight: "600" }}>
          • Antecipou {Math.floor(antMin / 60) > 0 ? `${Math.floor(antMin / 60)}h ` : ""}{antMin % 60}m
        </div>
      )}
      {prorMin > 0 && (
        <div style={{ color: "#ef5b25", fontSize: "11.5px", marginTop: "2px", fontWeight: "600" }}>
          • Prorrogou {Math.floor(prorMin / 60) > 0 ? `${Math.floor(prorMin / 60)}h ` : ""}{prorMin % 60}m
        </div>
      )}
      {antMin <= 0 && prorMin <= 0 && (
        <div style={{ color: "var(--text-dark-muted)", fontSize: "11px", marginTop: "2px", fontStyle: "italic" }}>
          No horário regulamentar
        </div>
      )}
    </div>
  );
};

// Months list for display
const monthsNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

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

// Helper to format a date to Brasília date/time string display
const formatToBrasiliaDateTime = (dateString) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

// Helper to extract the month index from request's actual or requested start date in Brasília Time
const getRequestMonth = (req) => {
  const dateStr = req.opPeriodStart || req.period?.start;
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  const brOffsetMs = -3 * 60 * 60 * 1000;
  const brDate = new Date(date.getTime() + brOffsetMs);
  return brDate.getUTCMonth(); // returns 0-11
};

// Helper to format minutes to "Xh YYm"
const formatMinToHours = (totalMinutes) => {
  if (totalMinutes <= 0) return "0h 00m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
};

// Helper to extract the year from request's actual or requested start date in Brasília Time
const getRequestYear = (req) => {
  const dateStr = req.opPeriodStart || req.period?.start;
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  const brOffsetMs = -3 * 60 * 60 * 1000;
  const brDate = new Date(date.getTime() + brOffsetMs);
  return brDate.getUTCFullYear();
};

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
  const [operators, setOperators] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("Todos");
  const [selectedOperator, setSelectedOperator] = useState("Todos");
  const [showReport, setShowReport] = useState(true);
  const [selectedYear, setSelectedYear] = useState("Todos");

  // Edit States
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({
    opPeriodStart: "",
    opPeriodEnd: "",
    opServedBy: "",
    opBillingStatus: "Não",
    opInvoiceId: "",
    opNacaStatus: "Pendente",
    opNotes: ""
  });

  // toLocalISOString removed in favor of module-level timezone-locked toBrasiliaISOString helper

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

      // Fetch settings to parse the operator list
      const settingsRes = await fetch("/api/admin/settings");
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        const opListStr = settingsData.settings?.operatorsList || "";
        const parsedOperators = opListStr
          .split(",")
          .map(o => o.trim())
          .filter(Boolean);
        setOperators(parsedOperators);
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
            lowerEmail === "developer@sbiz.local" ||
            lowerEmail === "operador@sbiz.local";
        }
        
        if (!isUserAuthorized) {
          // Check settings (admins and operators lists)
          try {
            const settingsRes = await fetch("/api/admin/settings");
            if (settingsRes.ok) {
              const settingsData = await settingsRes.json();
              
              const allowedAdminsStr = settingsData.settings?.adminEmails || "";
              const allowedAdmins = allowedAdminsStr
                .split(/[,;]/)
                .map(e => e.trim().toLowerCase())
                .filter(e => e.length > 0);

              const allowedOperatorsStr = settingsData.settings?.operationalEmails || "";
              const allowedOperators = allowedOperatorsStr
                .split(/[,;]/)
                .map(e => e.trim().toLowerCase())
                .filter(e => e.length > 0);

              if (allowedAdmins.includes(lowerEmail) || allowedOperators.includes(lowerEmail)) {
                isUserAuthorized = true;
              }
            }
          } catch (settingsErr) {
            console.error("Error checking settings for authorization:", settingsErr);
          }

          // Check database profile role
          if (!isUserAuthorized && db) {
            try {
              const profileRef = doc(db, "profiles", currentUser.uid);
              const profileSnap = await getDoc(profileRef);
              if (profileSnap.exists()) {
                const profileData = profileSnap.data();
                if (profileData.role === "admin" || profileData.role === "operator" || profileData.role === "operational") {
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
      opPeriodStart: toBrasiliaISOString(req.opPeriodStart || req.period?.start),
      opPeriodEnd: toBrasiliaISOString(req.opPeriodEnd || req.period?.end),
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
      if (editFields.opPeriodStart && editFields.opPeriodEnd) {
        if (parseBrasiliaDate(editFields.opPeriodStart) >= parseBrasiliaDate(editFields.opPeriodEnd)) {
          throw new Error("A data de término do atendimento deve ser posterior à data de início.");
        }
      }

      const response = await fetch("/api/admin/requests/operational", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          opPeriodStart: editFields.opPeriodStart ? parseBrasiliaDate(editFields.opPeriodStart).toISOString() : "",
          opPeriodEnd: editFields.opPeriodEnd ? parseBrasiliaDate(editFields.opPeriodEnd).toISOString() : "",
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

  // Extract all available years from operational requests dynamically
  const availableYears = Array.from(new Set(requests.map(r => getRequestYear(r)).filter(Boolean))).sort((a, b) => b - a);

  // Filter requests
  const filteredRequests = requests.filter(r => {
    const query = searchQuery.toLowerCase();
    
    // 1. Search Query match
    const matchesQuery = (
      r.id.toLowerCase().includes(query) ||
      r.company?.name?.toLowerCase().includes(query) ||
      r.aircraft?.registration?.toLowerCase().includes(query) ||
      r.opServedBy?.toLowerCase().includes(query) ||
      r.opInvoiceId?.toLowerCase().includes(query)
    );

    // 2. Month match
    let matchesMonth = true;
    if (selectedMonth !== "Todos") {
      const monthIdx = getRequestMonth(r);
      matchesMonth = monthIdx === parseInt(selectedMonth);
    }

    // 3. Operator match
    let matchesOperator = true;
    if (selectedOperator !== "Todos") {
      matchesOperator = r.opServedBy === selectedOperator;
    }

    // 4. Year match
    let matchesYear = true;
    if (selectedYear !== "Todos") {
      const year = getRequestYear(r);
      matchesYear = year === parseInt(selectedYear);
    }

    return matchesQuery && matchesMonth && matchesOperator && matchesYear;
  });

  // Calculate report data grouped by operator, filtered by selected month, year and operator
  const reportRequestsList = requests.filter(r => {
    let matchesMonth = true;
    if (selectedMonth !== "Todos") {
      const monthIdx = getRequestMonth(r);
      matchesMonth = monthIdx === parseInt(selectedMonth);
    }

    let matchesOperator = true;
    if (selectedOperator !== "Todos") {
      matchesOperator = r.opServedBy === selectedOperator;
    }

    let matchesYear = true;
    if (selectedYear !== "Todos") {
      const year = getRequestYear(r);
      matchesYear = year === parseInt(selectedYear);
    }

    return matchesMonth && matchesOperator && matchesYear;
  });

  const getReportData = () => {
    const report = {};

    reportRequestsList.forEach(req => {
      const op = req.opServedBy;
      if (!op) return; // Ignore if no operator is set yet

      if (!report[op]) {
        report[op] = { name: op, count: 0, durationMin: 0, antMin: 0, prorMin: 0 };
      }

      const reqStart = new Date(req.period?.start);
      const reqEnd = new Date(req.period?.end);
      const actStart = new Date(req.opPeriodStart || req.period?.start);
      const actEnd = new Date(req.opPeriodEnd || req.period?.end);

      if (isNaN(reqStart.getTime()) || isNaN(reqEnd.getTime()) || isNaN(actStart.getTime()) || isNaN(actEnd.getTime())) {
        return;
      }

      const durationMin = Math.round((actEnd - actStart) / 60000);

      // Shift Limits: 00:00 and 17:50 local time on the day of the flight, in Brasília time (UTC-3)
      const shiftStartLimit = getBrasiliaBoundary(reqStart, 0, 0);
      const shiftEndLimit = getBrasiliaBoundary(reqEnd, 17, 50);

      // Antecipação (only if actual start is before operator shift start at 00:00 LOCAL)
      let antMin = 0;
      if (actStart < shiftStartLimit) {
        const antEnd = actEnd < shiftStartLimit ? actEnd : shiftStartLimit;
        antMin = Math.max(0, Math.round((antEnd - actStart) / 60000));
      }

      // Prorrogação (only if actual end is after operator shift end at 17:50 LOCAL)
      let prorMin = 0;
      if (actEnd > shiftEndLimit) {
        const prorStart = actStart > shiftEndLimit ? actStart : shiftEndLimit;
        prorMin = Math.max(0, Math.round((actEnd - prorStart) / 60000));
      }

      report[op].count += 1;
      report[op].durationMin += durationMin;
      report[op].antMin += antMin;
      report[op].prorMin += prorMin;
    });

    return Object.values(report).sort((a, b) => b.durationMin - a.durationMin);
  };

  const reportData = getReportData();

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

        {/* Filters Panel */}
        <div style={{ 
          display: "flex", 
          gap: "16px", 
          marginBottom: "20px", 
          flexWrap: "wrap",
          alignItems: "flex-end"
        }}>
          {/* Search bar */}
          <div style={{ flex: "1", minWidth: "250px", position: "relative" }}>
            <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", display: "block", marginBottom: "6px", fontWeight: "600" }}>
              Pesquisar
            </span>
            <Search size={16} style={{ position: "absolute", left: "14px", bottom: "12px", color: "var(--text-dark-muted)" }} />
            <input 
              type="text" 
              className="form-input" 
              style={{ paddingLeft: "42px", height: "40px" }}
              placeholder="Empresa, matrícula, fatura, operador..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Month selector */}
          <div style={{ width: "160px", minWidth: "140px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", display: "block", marginBottom: "6px", fontWeight: "600" }}>
              Filtrar por Mês
            </span>
            <select
              className="form-input"
              style={{ height: "40px", padding: "8px 12px" }}
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              disabled={loading}
            >
              <option value="Todos">Todos os Meses</option>
              {monthsNames.map((name, idx) => (
                <option key={idx} value={idx.toString()}>{name}</option>
              ))}
            </select>
          </div>

          {/* Year selector */}
          <div style={{ width: "130px", minWidth: "110px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", display: "block", marginBottom: "6px", fontWeight: "600" }}>
              Filtrar por Ano
            </span>
            <select
              className="form-input"
              style={{ height: "40px", padding: "8px 12px" }}
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              disabled={loading}
            >
              <option value="Todos">Todos os Anos</option>
              {availableYears.map(year => (
                <option key={year} value={year.toString()}>{year}</option>
              ))}
              {availableYears.length === 0 && (
                <option value="2026">2026</option>
              )}
            </select>
          </div>

          {/* Operator selector */}
          <div style={{ width: "220px", minWidth: "180px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", display: "block", marginBottom: "6px", fontWeight: "600" }}>
              Filtrar por Operador
            </span>
            <select
              className="form-input"
              style={{ height: "40px", padding: "8px 12px" }}
              value={selectedOperator}
              onChange={e => setSelectedOperator(e.target.value)}
              disabled={loading}
            >
              <option value="Todos">Todos os Operadores</option>
              {operators.map((op, idx) => (
                <option key={idx} value={op}>{op}</option>
              ))}
            </select>
          </div>

          {/* Report toggle button */}
          <button 
            onClick={() => setShowReport(!showReport)}
            className="admin-action-btn"
            style={{ 
              height: "40px", 
              padding: "0 16px", 
              fontSize: "13px", 
              display: "inline-flex", 
              alignItems: "center", 
              gap: "6px",
              borderColor: showReport ? "var(--accent)" : "rgba(255,255,255,0.15)",
              color: showReport ? "white" : "var(--text-dark-muted)"
            }}
            title="Exibir ou ocultar tabela de relatório mensal consolidado"
          >
            <FileText size={16} style={{ color: showReport ? "var(--accent)" : "inherit" }} />
            <span>{showReport ? "Ocultar Relatório" : "Ver Relatório"}</span>
          </button>
        </div>

        {/* Report Card */}
        {showReport && (
          <div className="card" style={{ 
            padding: "20px", 
            marginBottom: "20px", 
            backgroundColor: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            animation: "fadeIn 0.2s ease-out"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <h3 style={{ fontSize: "15px", color: "white", display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
                <FileText size={18} style={{ color: "var(--accent)" }} />
                <span>
                  Relatório Consolidado — {selectedMonth === "Todos" ? "Todos os Meses" : monthsNames[parseInt(selectedMonth)]} {selectedYear === "Todos" ? "de Todos os Anos" : `de ${selectedYear}`}
                </span>
              </h3>
              <span style={{ fontSize: "11px", color: "var(--text-dark-muted)", fontStyle: "italic" }}>
                * Calculado a partir de atendimentos finalizados com operador atribuído
              </span>
            </div>
            
            {reportData.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--text-dark-muted)", textAlign: "center", padding: "16px 0", margin: 0, fontStyle: "italic" }}>
                Nenhum atendimento operacional registrado para o período de {selectedMonth === "Todos" ? "todos os meses" : monthsNames[parseInt(selectedMonth)]}.
              </p>
            ) : (
              <div className="admin-table-container" style={{ maxHeight: "350px", overflowY: "auto", margin: 0 }}>
                <table className="admin-table" style={{ fontSize: "13.5px" }}>
                  <thead>
                    <tr>
                      <th>Operador PNA/OEA</th>
                      <th style={{ textAlign: "center", width: "160px" }}>Qtd. Atendimentos</th>
                      <th style={{ textAlign: "center", width: "220px" }}>Tempo Total Atendido</th>
                      <th style={{ textAlign: "center", width: "200px" }}>Total Antecipado</th>
                      <th style={{ textAlign: "center", width: "200px" }}>Total Prorrogado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((row) => (
                      <tr key={row.name}>
                        <td style={{ fontWeight: "bold", color: "white" }}>{row.name}</td>
                        <td style={{ textAlign: "center", fontWeight: "600" }}>{row.count}</td>
                        <td style={{ textAlign: "center", color: "var(--accent)", fontWeight: "600" }}>{formatMinToHours(row.durationMin)}</td>
                        <td style={{ textAlign: "center", color: "#3b82f6", fontWeight: "600" }}>{formatMinToHours(row.antMin)}</td>
                        <td style={{ textAlign: "center", color: "#ef5b25", fontWeight: "600" }}>{formatMinToHours(row.prorMin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
                  <th style={{ minWidth: "180px" }}>Atendimento PNA/OEA</th>
                  <th style={{ minWidth: "180px" }}>Prorrogação / Antecipação</th>
                  <th style={{ minWidth: "150px" }}>Operador (PNA/OEA)</th>
                  <th style={{ width: "120px" }}>Cobrança Realizada</th>
                  <th style={{ width: "130px" }}>ID Fatura</th>
                  <th style={{ width: "135px" }}>Envio NACA</th>
                  <th style={{ minWidth: "180px" }}>Observações</th>
                  <th style={{ width: "90px" }}>PDF</th>
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
                        <span style={{ fontWeight: "bold", color: "var(--accent)" }}>
                          {req.aircraft?.registration || "-"}
                        </span>
                      </td>
                      
                      {/* Período Alteração */}
                      <td>
                        <div style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
                          <div><strong>De:</strong> {formatToBrasiliaDateTime(req.period?.start)}</div>
                          <div style={{ marginTop: "2px" }}><strong>Até:</strong> {formatToBrasiliaDateTime(req.period?.end)}</div>
                        </div>
                      </td>

                      {/* Atendimento PNA/OEA */}
                      <td>
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <div>
                              <span style={{ fontSize: "10px", color: "var(--text-dark-muted)", display: "block" }}>Início:</span>
                              <input 
                                type="datetime-local"
                                className="form-input"
                                style={{ padding: "6px", fontSize: "11px", height: "auto" }}
                                value={editFields.opPeriodStart}
                                onChange={e => setEditFields({ ...editFields, opPeriodStart: e.target.value })}
                              />
                            </div>
                            <div>
                              <span style={{ fontSize: "10px", color: "var(--text-dark-muted)", display: "block" }}>Fim:</span>
                              <input 
                                type="datetime-local"
                                className="form-input"
                                style={{ padding: "6px", fontSize: "11px", height: "auto" }}
                                value={editFields.opPeriodEnd}
                                onChange={e => setEditFields({ ...editFields, opPeriodEnd: e.target.value })}
                              />
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
                            {req.opPeriodStart ? (
                              <>
                                <div><strong>De:</strong> {formatToBrasiliaDateTime(req.opPeriodStart)}</div>
                                <div style={{ marginTop: "2px" }}><strong>Até:</strong> {formatToBrasiliaDateTime(req.opPeriodEnd)}</div>
                              </>
                            ) : (
                              <div style={{ color: "var(--text-dark-muted)", fontStyle: "italic" }}>Mesmo da Alteração</div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Prorrogação / Antecipação */}
                      <td>
                        {renderAttendanceDetails(req)}
                      </td>

                      {/* Operador (PNA/OEA) */}
                      <td>
                        {isEditing ? (
                          <select 
                            className="form-input"
                            style={{ padding: "8px", fontSize: "12.5px", height: "38px" }}
                            value={editFields.opServedBy}
                            onChange={e => setEditFields({ ...editFields, opServedBy: e.target.value })}
                          >
                            <option value="">Selecione...</option>
                            {operators.map((op, idx) => (
                              <option key={idx} value={op}>{op}</option>
                            ))}
                          </select>
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

                      {/* PDF */}
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
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center"
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
