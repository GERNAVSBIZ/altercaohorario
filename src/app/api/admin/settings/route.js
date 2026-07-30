import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req) {
  try {
    const defaultSettings = {
      airportAdminEmail: process.env.AIRPORT_ADMIN_EMAIL || "administracao.sbiz@localhost.com",
      emailSubjectPrefix: "SOLICITAÇÃO DE PRORROGAÇÃO DE HORÁRIO - SBIZ",
      customNotes: "",
      adminEmails: "adriano.matos@navbrasil.gov.br, gernavsbiz@gmail.com",
      ccDecisionEmails: "",
      operatorsList: "Adriano Matos, João Silva, Marcos Souza",
      operationalEmails: "",
      operatorsEmails: "",
      stationStartLocal: "00:15",
      stationEndLocal: "17:45",
      leadTimeRegular: 2,
      leadTimeNonRegular: 2,
      leadTimePrivate: 24,
      leadTimeCargo: 2,
      leadTimeUti: 0,
      leadTimeOther: 0
    };

    if (adminDb) {
      const settingsSnap = await adminDb.collection("config").doc("settings").get();
      if (settingsSnap.exists) {
        const data = settingsSnap.data();
        return NextResponse.json({
          success: true,
          settings: {
            ...defaultSettings,
            ...data
          }
        });
      }
    }

    return NextResponse.json({ success: true, settings: defaultSettings, mock: !adminDb });
  } catch (error) {
    console.error("GET admin settings error:", error);
    return NextResponse.json(
      { error: "Erro ao carregar as configurações: " + error.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const data = await req.json();

    const { 
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
    } = data;
    
    if (!airportAdminEmail) {
      return NextResponse.json(
        { error: "O e-mail administrativo é obrigatório." },
        { status: 400 }
      );
    }

    const settings = {
      airportAdminEmail: airportAdminEmail.toLowerCase(),
      emailSubjectPrefix: emailSubjectPrefix || "SOLICITAÇÃO DE PRORROGAÇÃO DE HORÁRIO - SBIZ",
      customNotes: customNotes || "",
      adminEmails: (adminEmails || "").toLowerCase(),
      ccDecisionEmails: (ccDecisionEmails || "").toLowerCase(),
      operatorsList: operatorsList || "",
      operationalEmails: (operationalEmails || "").toLowerCase(),
      operatorsEmails: (operatorsEmails || "").toLowerCase(),
      stationStartLocal: stationStartLocal || "00:15",
      stationEndLocal: stationEndLocal || "17:45",
      leadTimeRegular: leadTimeRegular !== undefined ? Number(leadTimeRegular) : 2,
      leadTimeNonRegular: leadTimeNonRegular !== undefined ? Number(leadTimeNonRegular) : 2,
      leadTimePrivate: leadTimePrivate !== undefined ? Number(leadTimePrivate) : 24,
      leadTimeCargo: leadTimeCargo !== undefined ? Number(leadTimeCargo) : 2,
      leadTimeUti: leadTimeUti !== undefined ? Number(leadTimeUti) : 0,
      leadTimeOther: leadTimeOther !== undefined ? Number(leadTimeOther) : 0,
      updatedAt: new Date().toISOString()
    };

    if (adminDb) {
      await adminDb.collection("config").doc("settings").set(settings);
      return NextResponse.json({
        success: true,
        message: "Configurações gravadas com sucesso no Firestore.",
        settings
      });
    } else {
      console.log("[SANDBOX] Configurações de administração simuladas atualizadas:", settings);
      return NextResponse.json({
        success: true,
        message: "Configurações gravadas com sucesso (Modo Simulação).",
        settings,
        mock: true
      });
    }
  } catch (error) {
    console.error("POST admin settings error:", error);
    return NextResponse.json(
      { error: "Erro ao gravar as configurações: " + error.message },
      { status: 500 }
    );
  }
}
