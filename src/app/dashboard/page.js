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
  Clock,
  X,
  Megaphone
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

// Helper to check if 17:30 Brasilia time deadline on period.start day has passed
const isDeadlinePassed = (periodStartIso) => {
  if (!periodStartIso) return false;
  const start = new Date(periodStartIso);
  if (isNaN(start.getTime())) return false;
  
  const brDateStr = start.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const deadline = new Date(`${brDateStr}T17:30:00-03:00`);
  const now = new Date();
  
  return now.getTime() > deadline.getTime();
};

// Checks if the requested period overlaps with the operational hours of the station
const checkOperationalHoursOverlap = (startStr, endStr, startLimit, endLimit) => {
  if (!startStr || !endStr || !startLimit || !endLimit) return null;

  const startDt = parseBrasiliaDate(startStr);
  const endDt = parseBrasiliaDate(endStr);
  
  if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) return null;

  // Convert time strings (HH:MM) to hours and minutes
  const [limitStartHour, limitStartMin] = startLimit.split(":").map(Number);
  const [limitEndHour, limitEndMin] = endLimit.split(":").map(Number);

  // Loop through each calendar day from startDt to endDt
  let currentDay = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate());
  const endDay = new Date(endDt.getFullYear(), endDt.getMonth(), endDt.getDate());

  while (currentDay <= endDay) {
    // For currentDay, construct the operational window in Brasilia time
    const y = currentDay.getFullYear();
    const m = String(currentDay.getMonth() + 1).padStart(2, "0");
    const d = String(currentDay.getDate()).padStart(2, "0");
    
    // Construct local Date objects for operational hours on this day
    const opStart = new Date(`${y}-${m}-${d}T${String(limitStartHour).padStart(2, "0")}:${String(limitStartMin).padStart(2, "0")}:00-03:00`);
    const opEnd = new Date(`${y}-${m}-${d}T${String(limitEndHour).padStart(2, "0")}:${String(limitEndMin).padStart(2, "0")}:00-03:00`);

    // Check if [startDt, endDt] overlaps with [opStart, opEnd]
    const overlapStart = new Date(Math.max(startDt.getTime(), opStart.getTime()));
    const overlapEnd = new Date(Math.min(endDt.getTime(), opEnd.getTime()));

    if (overlapStart < overlapEnd) {
      return {
        start: overlapStart,
        end: overlapEnd,
        dateStr: currentDay.toLocaleDateString("pt-BR")
      };
    }

    // Move to next day
    currentDay.setDate(currentDay.getDate() + 1);
  }

  return null; // No overlap!
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Announcements State
  const [unreadAnnouncements, setUnreadAnnouncements] = useState([]);

  // Station hours states
  const [stationStartLocal, setStationStartLocal] = useState("00:15");
  const [stationEndLocal, setStationEndLocal] = useState("17:45");

  // Lead times configuration states
  const [leadTimeRegular, setLeadTimeRegular] = useState(2);
  const [leadTimeNonRegular, setLeadTimeNonRegular] = useState(2);
  const [leadTimePrivate, setLeadTimePrivate] = useState(24);
  const [leadTimeCargo, setLeadTimeCargo] = useState(2);
  const [leadTimeUti, setLeadTimeUti] = useState(0);
  const [leadTimeOther, setLeadTimeOther] = useState(0);

  // Late request confirmation modal states
  const [showLateRequestConfirmModal, setShowLateRequestConfirmModal] = useState(false);
  const [lateRequestRequired, setLateRequestRequired] = useState(0);
  const [lateRequestActual, setLateRequestActual] = useState(0);
  const [lateRequestPayload, setLateRequestPayload] = useState(null);

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

  const fetchUnreadAnnouncements = async (userId) => {
    try {
      const res = await fetch(`/api/announcements?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUnreadAnnouncements(data.announcements || []);
        }
      }
    } catch (err) {
      console.error("Error fetching unread announcements:", err);
    }
  };

  const handleMarkAnnouncementRead = async (announcementId) => {
    if (!user) return;
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementId, userId: user.uid })
      });
      if (res.ok) {
        setUnreadAnnouncements(prev => prev.filter(item => item.id !== announcementId));
      }
    } catch (err) {
      console.error("Error marking announcement as read:", err);
    }
  };

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
      fetchUnreadAnnouncements("mock-user-123");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        setUser(currentUser);
        fetchUnreadAnnouncements(currentUser.uid);
        
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

            // Check config settings and station hours
            try {
              const settingsRes = await fetch("/api/admin/settings");
              if (settingsRes.ok) {
                const settingsData = await settingsRes.json();
                const settings = settingsData.settings || {};
                
                // Admin check
                const allowedAdminsStr = settings.adminEmails || "";
                const allowedAdmins = allowedAdminsStr
                  .split(/[,;]/)
                  .map(e => e.trim().toLowerCase())
                  .filter(e => e.length > 0);
                if (allowedAdmins.includes(lowerEmail)) {
                  userIsAdmin = true;
                }

                // Load station hours
                setStationStartLocal(settings.stationStartLocal || "00:15");
                setStationEndLocal(settings.stationEndLocal || "17:45");

                // Load lead times
                setLeadTimeRegular(settings.leadTimeRegular !== undefined ? settings.leadTimeRegular : 2);
                setLeadTimeNonRegular(settings.leadTimeNonRegular !== undefined ? settings.leadTimeNonRegular : 2);
                setLeadTimePrivate(settings.leadTimePrivate !== undefined ? settings.leadTimePrivate : 24);
                setLeadTimeCargo(settings.leadTimeCargo !== undefined ? settings.leadTimeCargo : 2);
                setLeadTimeUti(settings.leadTimeUti !== undefined ? settings.leadTimeUti : 0);
                setLeadTimeOther(settings.leadTimeOther !== undefined ? settings.leadTimeOther : 0);
              }
            } catch (settingsErr) {
              console.error("Error loading settings in dashboard:", settingsErr);
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

  const handleClientCancelRequest = async (requestId, periodStart) => {
    if (isDeadlinePassed(periodStart)) {
      alert("Ações de cancelamento só são permitidas até às 17h30 do dia da alteração de horário.");
      return;
    }

    if (!confirm("Tem certeza que deseja cancelar esta solicitação de prorrogação de horário?")) {
      return;
    }

    setHistoryLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const response = await fetch("/api/requests/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao cancelar solicitação.");

      setSuccessMsg(data.message || "Solicitação cancelada com sucesso!");
      await fetchUserRequests();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Client cancel request error:", err);
      setErrorMsg(err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleStartEditRequest = (req) => {
    if (isDeadlinePassed(req.period?.start)) {
      alert("Ações de edição só são permitidas até às 17h30 do dia da alteração de horário.");
      return;
    }

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

  const executeSubmitRequest = async (requestPayload) => {
    try {
      setSubmitLoading(true);
      
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
            lateRequest: requestPayload.lateRequest || false,
            lateRequestDetails: requestPayload.lateRequestDetails || null,
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
            notes: requestPayload.notes,
            lateRequest: requestPayload.lateRequest || false,
            lateRequestDetails: requestPayload.lateRequestDetails || null
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
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSubmitLoading(true);

    const showError = (msg, section) => {
      setErrorMsg(msg);
      setOpenSections(prev => ({ ...prev, [section]: true }));
      setSubmitLoading(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // Validation checks
    if (!companyName || !companyTaxId || !companyEmail || !companyPhone || !companyAddress) {
      showError("Por favor, preencha todos os dados da empresa.", "company");
      return;
    }

    if (!aircraftOperator || !requestorName || !requestorRole || !requestorBillingEmail || !serviceType) {
      showError("Por favor, preencha os dados do solicitante, operador e e-mail de faturamento.", "operator");
      return;
    }

    if (!aircraftTypeQty || !aircraftRegistration || !pilotName || !pilotAnac) {
      showError("Por favor, preencha a identificação da aeronave, matrícula e dados do piloto.", "flight");
      return;
    }

    if (!intentionDecolagem && !intentionPouso && !intentionAlternativa) {
      showError("Por favor, selecione pelo menos uma Intenção de Voo (Decolagem, Pouso ou Alternativa).", "period");
      return;
    }

    if (!periodStart || !periodEnd) {
      showError("Por favor, preencha o período solicitado.", "period");
      return;
    }

    if (parseBrasiliaDate(periodStart) >= parseBrasiliaDate(periodEnd)) {
      showError("A data/hora de término deve ser após a data/hora de início.", "period");
      return;
    }

    // Validate station operational hours overlap
    const overlap = checkOperationalHoursOverlap(periodStart, periodEnd, stationStartLocal, stationEndLocal);
    if (overlap) {
      const overlapStart = overlap.start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const overlapEnd = overlap.end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      
      showError(
        `⚠️ Conflito (${overlap.dateStr}, das ${overlapStart} às ${overlapEnd}): ` +
        `Esse horário está dentro do funcionamento da Rádio Imperatriz (${stationStartLocal} às ${stationEndLocal}). ` +
        `Por favor, solicite apenas entre ${stationEndLocal} e ${stationStartLocal}.`,
        "period"
      );
      return;
    }

    // Calculate lead time difference
    const startDt = parseBrasiliaDate(periodStart);
    const nowDt = new Date();
    const diffMs = startDt.getTime() - nowDt.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // Determine min hours needed based on serviceType
    let minHours = 0;
    if (serviceType === "Regular (CIA AÉREAS)") minHours = leadTimeRegular;
    else if (serviceType === "Não Regular ( TAXI ÁEREO)") minHours = leadTimeNonRegular;
    else if (serviceType === "Geral (Executiva)") minHours = leadTimePrivate;
    else if (serviceType === "Carga Aérea") minHours = leadTimeCargo;
    else if (serviceType === "Serviço de saúde (Aeromédico)") minHours = leadTimeUti;
    else if (serviceType === "Outro") minHours = leadTimeOther;

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

    // If request is late, prompt confirmation modal
    if (minHours > 0 && diffHours < minHours) {
      setLateRequestRequired(minHours);
      const roundedActual = Math.max(0, Math.round(diffHours * 10) / 10);
      setLateRequestActual(roundedActual);
      setLateRequestPayload({
        ...requestPayload,
        lateRequest: true,
        lateRequestDetails: {
          requiredHours: minHours,
          actualHours: roundedActual
        }
      });
      setShowLateRequestConfirmModal(true);
      setSubmitLoading(false);
      return;
    }

    await executeSubmitRequest(requestPayload);
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
                        onChange={e => setCompanyEmail(e.target.value.toLowerCase())}
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
                          onChange={e => setRequestorBillingEmail(e.target.value.toLowerCase())}
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
                        <option value="Regular (CIA AÉREAS)">Regular (CIA AÉREAS)</option>
                        <option value="Não Regular ( TAXI ÁEREO)">Não Regular ( TAXI ÁEREO)</option>
                        <option value="Geral (Executiva)">Geral (Executiva)</option>
                        <option value="Carga Aérea">Carga Aérea</option>
                        <option value="Serviço de saúde (Aeromédico)">Serviço de saúde (Aeromédico)</option>
                        <option value="Outro">Outro</option>
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
                    <div style={{
                      backgroundColor: "rgba(245, 158, 11, 0.06)",
                      border: "1.5px solid rgba(245, 158, 11, 0.2)",
                      borderRadius: "6px",
                      padding: "12px 16px",
                      marginBottom: "16px",
                      fontSize: "13px",
                      color: "#f59e0b",
                      lineHeight: "1.4"
                    }}>
                      ⚠️ Horário operacional da Rádio Imperatriz: das <strong>{stationStartLocal}</strong> às <strong>{stationEndLocal}</strong> (Brasília). Prorrogações ou antecipações só fora deste período.
                    </div>
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
                        {req.approvalStatus === "cancelled" && (
                          <span className="badge badge-warning" style={{ width: "100%", fontSize: "10px", padding: "2px 6px", backgroundColor: "#e8590c", color: "white" }}>Cancelada</span>
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

                    {isDeadlinePassed(req.period?.start) && req.approvalStatus !== "cancelled" && req.approvalStatus !== "not_authorized" && (
                      <div style={{ 
                        marginTop: "6px", 
                        padding: "6px 10px", 
                        backgroundColor: "rgba(239, 68, 68, 0.08)", 
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        borderRadius: "4px",
                        fontSize: "11px",
                        color: "#f87171",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                      }}>
                        <Clock size={13} />
                        <span>Prazo de edição/cancelamento pelo cliente encerrado (17h30 do dia do voo)</span>
                      </div>
                    )}

                    <div style={{ 
                      display: "flex", 
                      justifyContent: "flex-end", 
                      gap: "8px", 
                      borderTop: "1px dashed var(--border-dark)", 
                      paddingTop: "10px",
                      marginTop: "8px"
                    }}>
                      {req.approvalStatus !== "cancelled" && req.approvalStatus !== "not_authorized" && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStartEditRequest(req)}
                            className="admin-action-btn"
                            disabled={isDeadlinePassed(req.period?.start)}
                            style={{ 
                              padding: "6px 12px", 
                              fontSize: "12px", 
                              display: "inline-flex", 
                              alignItems: "center", 
                              gap: "4px",
                              borderColor: isDeadlinePassed(req.period?.start) ? "rgba(255,255,255,0.1)" : "var(--accent)",
                              color: isDeadlinePassed(req.period?.start) ? "rgba(255,255,255,0.4)" : "white",
                              cursor: isDeadlinePassed(req.period?.start) ? "not-allowed" : "pointer"
                            }}
                            title={isDeadlinePassed(req.period?.start) ? "Prazo de edição encerrado às 17h30 do dia do voo" : "Editar solicitação"}
                          >
                            <RefreshCw size={12} />
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => handleClientCancelRequest(req.id, req.period?.start)}
                            className="admin-action-btn btn-reject"
                            disabled={isDeadlinePassed(req.period?.start)}
                            style={{ 
                              padding: "6px 12px", 
                              fontSize: "12px", 
                              display: "inline-flex", 
                              alignItems: "center", 
                              gap: "4px",
                              backgroundColor: isDeadlinePassed(req.period?.start) ? "rgba(255,255,255,0.05)" : "rgba(232, 89, 12, 0.15)",
                              borderColor: isDeadlinePassed(req.period?.start) ? "rgba(255,255,255,0.1)" : "rgba(232, 89, 12, 0.4)",
                              color: isDeadlinePassed(req.period?.start) ? "rgba(255,255,255,0.4)" : "#ffa8a8",
                              cursor: isDeadlinePassed(req.period?.start) ? "not-allowed" : "pointer"
                            }}
                            title={isDeadlinePassed(req.period?.start) ? "Prazo de cancelamento encerrado às 17h30 do dia do voo" : "Cancelar solicitação"}
                          >
                            <X size={12} />
                            Cancelar Solicitação
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
      {/* Announcements Popup Modal */}
      {unreadAnnouncements.length > 0 && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(11, 15, 25, 0.85)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 99999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px"
        }}>
          <div className="card" style={{
            maxWidth: "550px",
            animation: "slideUp 0.4s ease-out",
            border: "1px solid var(--accent)",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.7)",
            padding: "32px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            background: "#121824"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--accent)" }}>
              <Megaphone size={28} />
              <h3 style={{ fontSize: "18px", fontWeight: "800", color: "white", margin: 0 }}>
                COMUNICADO IMPORTANTE
              </h3>
            </div>
            
            <hr style={{ border: 0, borderTop: "1px solid var(--border-dark)", margin: 0 }} />

            <div>
              <h4 style={{ fontSize: "15px", fontWeight: "700", color: "white", marginBottom: "12px" }}>
                {unreadAnnouncements[0].title}
              </h4>
              <p style={{
                fontSize: "13.5px",
                color: "var(--text-dark-muted)",
                lineHeight: "1.6",
                whiteSpace: "pre-line",
                maxHeight: "250px",
                overflowY: "auto",
                paddingRight: "8px"
              }}>
                {unreadAnnouncements[0].content}
              </p>
            </div>

            <hr style={{ border: 0, borderTop: "1px solid var(--border-dark)", margin: 0 }} />

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => handleMarkAnnouncementRead(unreadAnnouncements[0].id)}
                className="admin-action-btn btn-approve"
                style={{
                  padding: "12px 24px",
                  fontSize: "13px",
                  fontWeight: "bold",
                  height: "40px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 10px rgba(239, 91, 37, 0.2)",
                  cursor: "pointer"
                }}
              >
                Estou Ciente
              </button>
            </div>
          </div>
        </div>
      )}

      {showLateRequestConfirmModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(10, 10, 10, 0.8)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "20px"
        }}>
          <div className="card" style={{
            maxWidth: "550px",
            width: "100%",
            backgroundColor: "#16161a",
            border: "1.5px solid rgba(244, 63, 94, 0.3)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            padding: "28px",
            borderRadius: "8px"
          }}>
            <h2 style={{
              color: "#f43f5e",
              fontSize: "18px",
              fontWeight: "bold",
              marginTop: 0,
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <CircleAlert size={22} style={{ color: "#f43f5e" }} />
              Aviso de Prazo Regulamentar (MCA 102-7)
            </h2>
            
            <div style={{
              backgroundColor: "rgba(244, 63, 94, 0.05)",
              borderLeft: "4px solid #f43f5e",
              padding: "14px",
              marginBottom: "20px",
              borderRadius: "4px"
            }}>
              <p style={{ margin: 0, fontSize: "14px", color: "#fca5a5", lineHeight: "1.5", fontWeight: "bold" }}>
                Atenção Operador: O prazo regulamentar para esta solicitação de alteração de horário (antecipação/prorrogação) não foi respeitado.
              </p>
            </div>

            <p style={{ fontSize: "13.5px", color: "var(--text-dark-muted)", lineHeight: "1.6", marginBottom: "20px" }}>
              <strong>Regra aplicável:</strong> De acordo com o <strong>MCA 102-7, itens 15.3.3.1 e 15.3.3.2</strong>, as solicitações devem ser realizadas com antecedência mínima de <strong>24 horas</strong> ou, excepcionalmente para empresas de transporte aéreo, com até <strong>1 (uma) hora</strong> de antecedência do encerramento do serviço.
            </p>

            <p style={{ fontSize: "13.5px", color: "var(--text-dark-muted)", lineHeight: "1.6", marginBottom: "24px" }}>
              A sua solicitação foi registrada no sistema, mas encontra-se <strong>FORA DO PRAZO</strong> (antecedência realizada: {lateRequestActual}h vs {lateRequestRequired}h exigida). O pedido foi encaminhado diretamente à <strong>Gerência da Dependência (DNB)</strong> para análise e deliberação excepcional.
            </p>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button 
                type="button"
                className="btn" 
                onClick={() => {
                  setShowLateRequestConfirmModal(false);
                  setLateRequestPayload(null);
                }}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "white",
                  padding: "10px 20px"
                }}
              >
                Cancelar e Ajustar
              </button>
              <button 
                type="button"
                className="btn" 
                onClick={async () => {
                  setShowLateRequestConfirmModal(false);
                  if (lateRequestPayload) {
                    await executeSubmitRequest(lateRequestPayload);
                  }
                }}
                style={{
                  backgroundColor: "#f43f5e",
                  borderColor: "#f43f5e",
                  color: "white",
                  padding: "10px 20px"
                }}
              >
                Confirmar e Enviar para DNB
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </main>
    </>
  );
}
