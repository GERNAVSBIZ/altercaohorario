import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const getBrasiliaDateInfo = (dateInput) => {
  const date = new Date(dateInput);
  const formatterStr = date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const d = new Date(formatterStr);
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hours: d.getHours(),
    minutes: d.getMinutes(),
    dateStr: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  };
};

const getOperationalDateInfo = (dateInput) => {
  const date = new Date(dateInput);
  const formatterStr = date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const d = new Date(formatterStr);
  
  let year = d.getFullYear();
  let month = d.getMonth();
  let day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  
  // If the flight starts in the early morning extension block (00:00 to 00:14)
  // its operational day is the previous calendar day.
  if (hours === 0 && minutes < 15) {
    d.setDate(d.getDate() - 1);
    year = d.getFullYear();
    month = d.getMonth();
    day = d.getDate();
  }
  
  return {
    year,
    month,
    day,
    hours,
    minutes,
    dateStr: `${year}-${String(month+1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  };
};

const isCancelledAfter1745 = (periodStart, cancelledAt) => {
  if (!periodStart || !cancelledAt) return false;
  
  const flightInfo = getOperationalDateInfo(periodStart);
  const cancelInfo = getBrasiliaDateInfo(cancelledAt);
  
  const flightDateVal = new Date(flightInfo.year, flightInfo.month, flightInfo.day).getTime();
  const cancelDateVal = new Date(cancelInfo.year, cancelInfo.month, cancelInfo.day).getTime();
  
  if (cancelDateVal > flightDateVal) {
    return true;
  }
  if (cancelDateVal < flightDateVal) {
    return false;
  }
  
  const cancelTimeInMinutes = cancelInfo.hours * 60 + cancelInfo.minutes;
  const limitTimeInMinutes = 17 * 60 + 45; // 17:45
  
  return cancelTimeInMinutes >= limitTimeInMinutes;
};

export async function GET(req) {
  try {
    if (adminDb) {
      const snap = await adminDb
        .collection("requests")
        .where("status", "==", "confirmed")
        .where("approvalStatus", "in", ["authorized", "cancelled"])
        .get();

      const requests = [];
      snap.forEach((doc) => {
        const data = doc.data();
        if (data.approvalStatus === "authorized" || isCancelledAfter1745(data.period?.start, data.cancelledAt)) {
          requests.push({ id: doc.id, ...data });
        }
      });

      // Sort by period.start descending locally since composite index might not exist yet
      requests.sort((a, b) => new Date(b.period?.start || 0) - new Date(a.period?.start || 0));

      return NextResponse.json({ success: true, requests });
    } else {
      // Sandbox mock fallback
      if (!global.mockRequests) {
        // Trigger initialization of mockRequests by importing or using dummy
        global.mockRequests = [];
      }
      
      // Filter the global mock requests list for authorized or late cancelled ones
      const operationalMocks = global.mockRequests.filter(
        (r) => r.status === "confirmed" && (r.approvalStatus === "authorized" || (r.approvalStatus === "cancelled" && isCancelledAfter1745(r.period?.start, r.cancelledAt)))
      );
      operationalMocks.sort((a, b) => new Date(b.period?.start || 0) - new Date(a.period?.start || 0));
      
      return NextResponse.json({ success: true, requests: operationalMocks, mock: true });
    }
  } catch (error) {
    console.error("GET operational requests error:", error);
    return NextResponse.json(
      { error: "Erro ao obter solicitações operacionais: " + error.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const { 
      id, 
      opPeriodStart, 
      opPeriodEnd, 
      opServedBy, 
      opBillingStatus, 
      opInvoiceId, 
      opNacaStatus, 
      opNotes,
      opAttendances
    } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "ID da solicitação é obrigatório." }, { status: 400 });
    }

    const opData = {
      opPeriodStart: opPeriodStart || "",
      opPeriodEnd: opPeriodEnd || "",
      opServedBy: opServedBy || "",
      opBillingStatus: opBillingStatus || "Não",
      opInvoiceId: opInvoiceId || "",
      opNacaStatus: opNacaStatus || "Pendente",
      opNotes: opNotes || "",
      opAttendances: opAttendances || [],
      opUpdatedAt: new Date().toISOString()
    };

    if (adminDb) {
      const docRef = adminDb.collection("requests").doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
      }

      await docRef.update(opData);
      return NextResponse.json({ success: true, message: "Dados operacionais salvos com sucesso." });
    } else {
      // Sandbox mock update
      if (global.mockRequests) {
        let found = false;
        global.mockRequests = global.mockRequests.map((r) => {
          if (r.id === id) {
            found = true;
            return {
              ...r,
              ...opData,
            };
          }
          return r;
        });
        
        // Also update lastMockRequest if it matches
        if (global.lastMockRequest && global.lastMockRequest.id === id) {
          global.lastMockRequest = {
            ...global.lastMockRequest,
            ...opData,
          };
        }

        if (!found) {
          return NextResponse.json({ error: "Solicitação não encontrada no ambiente de simulação." }, { status: 404 });
        }
      }
      return NextResponse.json({ success: true, message: "[SIMULAÇÃO] Dados operacionais salvos com sucesso.", mock: true });
    }
  } catch (error) {
    console.error("POST operational request error:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar dados operacionais: " + error.message },
      { status: 500 }
    );
  }
}
