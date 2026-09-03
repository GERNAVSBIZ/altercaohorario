import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      aircraftRegistration,
      aircraftTypeQty,
      companyName,
      companyTaxId,
      serviceType,
      periodStart,
      periodEnd,
      intentions,
      opServedBy,
      opBillingStatus,
      opNotes,
      notes
    } = body;

    if (!aircraftRegistration || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: "Matrícula da aeronave e período (início e fim) são obrigatórios." },
        { status: 400 }
      );
    }

    const startDt = new Date(periodStart);
    const endDt = new Date(periodEnd);
    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime()) || startDt >= endDt) {
      return NextResponse.json(
        { error: "Período inválido: o horário final deve ser posterior ao inicial." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const cleanReg = aircraftRegistration.toUpperCase().trim();
    const cleanCompany = (companyName || "Não Informado").trim();

    const requestData = {
      company: {
        name: cleanCompany,
        taxId: (companyTaxId || "").trim() || "-",
        email: "",
        phone: "",
        address: ""
      },
      aircraft: {
        operator: cleanCompany,
        registration: cleanReg,
        typeQty: (aircraftTypeQty || "1").trim()
      },
      requestor: {
        name: "Lançamento Direto (Estação)",
        role: "Operacional",
        billingEmail: ""
      },
      pilot: {
        name: "-",
        anacCode: "-"
      },
      serviceType: serviceType || "Geral (Executiva)",
      period: {
        start: startDt.toISOString(),
        end: endDt.toISOString()
      },
      intentions: intentions || {
        decolagem: true,
        pouso: false,
        alternativa: false
      },
      notes: notes || opNotes || "Registro inserido manualmente pela equipe operacional da estação.",
      status: "confirmed",
      approvalStatus: "authorized",
      manualEntry: true,
      createdAt: now,
      confirmedAt: now,
      authorizedAt: now,
      opPeriodStart: startDt.toISOString(),
      opPeriodEnd: endDt.toISOString(),
      opServedBy: opServedBy || "",
      opBillingStatus: opBillingStatus || "Isento",
      opInvoiceId: "",
      opNacaStatus: "Pendente",
      opNotes: opNotes || notes || "",
      opAttendances: opServedBy ? [
        {
          operator: opServedBy,
          start: startDt.toISOString(),
          end: endDt.toISOString()
        }
      ] : [],
      opUpdatedAt: now
    };

    if (adminDb) {
      const docRef = await adminDb.collection("requests").add(requestData);
      console.log(`[MANUAL ENTRY] Solicitação manual criada com sucesso com ID: ${docRef.id}`);
      return NextResponse.json({
        success: true,
        requestId: docRef.id,
        message: "Prorrogação manual registrada com sucesso!"
      });
    } else {
      // Sandbox fallback
      if (!global.mockRequests) {
        global.mockRequests = [];
      }
      const mockId = `req_man_${Math.random().toString(36).substring(2, 9)}`;
      const mockObj = { id: mockId, ...requestData };
      global.mockRequests.unshift(mockObj);
      console.log(`[SANDBOX MANUAL ENTRY] Criado mock #${mockId}`);
      return NextResponse.json({
        success: true,
        requestId: mockId,
        message: "[SIMULAÇÃO] Prorrogação manual registrada com sucesso!",
        mock: true
      });
    }
  } catch (error) {
    console.error("POST manual request error:", error);
    return NextResponse.json(
      { error: "Erro ao registrar prorrogação manual: " + error.message },
      { status: 500 }
    );
  }
}
