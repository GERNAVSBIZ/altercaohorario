import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req) {
  try {
    if (adminDb) {
      const snap = await adminDb
        .collection("requests")
        .where("status", "==", "confirmed")
        .where("approvalStatus", "==", "authorized")
        .get();

      const requests = [];
      snap.forEach((doc) => {
        requests.push({ id: doc.id, ...doc.data() });
      });

      // Sort by createdAt descending locally since composite index might not exist yet
      requests.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      return NextResponse.json({ success: true, requests });
    } else {
      // Sandbox mock fallback
      if (!global.mockRequests) {
        // Trigger initialization of mockRequests by importing or using dummy
        global.mockRequests = [];
      }
      
      // Filter the global mock requests list for authorized ones
      const authorizedMocks = global.mockRequests.filter(
        (r) => r.status === "confirmed" && r.approvalStatus === "authorized"
      );
      
      return NextResponse.json({ success: true, requests: authorizedMocks, mock: true });
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
