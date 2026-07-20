import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

function checkIsDeadlinePassed(periodStartIso) {
  if (!periodStartIso) return false;
  const start = new Date(periodStartIso);
  if (isNaN(start.getTime())) return false;
  
  const brDateStr = start.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const deadline = new Date(`${brDateStr}T17:30:00-03:00`);
  const now = new Date();
  
  return now.getTime() > deadline.getTime();
}

export async function POST(req) {
  try {
    const { requestId } = await req.json();

    if (!requestId) {
      return NextResponse.json(
        { error: "ID da solicitação é obrigatório." },
        { status: 400 }
      );
    }

    if (adminDb) {
      const requestRef = adminDb.collection("requests").doc(requestId);
      const docSnap = await requestRef.get();

      if (!docSnap.exists) {
        return NextResponse.json(
          { error: "Solicitação não encontrada." },
          { status: 404 }
        );
      }

      const data = docSnap.data();
      const requestData = { id: docSnap.id, ...data };

      // Validate 17:30 Brasilia time deadline rule for client cancellation
      if (checkIsDeadlinePassed(data.period?.start)) {
        return NextResponse.json(
          { error: "O cancelamento pelo operador só é permitido até às 17h30 do dia da alteração de horário." },
          { status: 400 }
        );
      }

      if (data.approvalStatus === "cancelled") {
        return NextResponse.json({
          success: true,
          message: "Esta solicitação já foi cancelada anteriormente.",
        });
      }

      const cancelledAt = new Date().toISOString();
      await requestRef.update({
        approvalStatus: "cancelled",
        cancelledAt,
        cancelledBy: "operator"
      });

      console.log(`[FIREBASE] Solicitação #${requestId} cancelada pelo operador.`);

      // Send cancellation notification email
      try {
        if (requestData.company?.email) {
          const { sendOperatorDecisionEmail } = await import("@/lib/brevo");
          
          let ccEmails = "";
          try {
            const settingsSnap = await adminDb.collection("config").doc("settings").get();
            if (settingsSnap.exists) {
              ccEmails = settingsSnap.data().ccDecisionEmails || "";
            }
          } catch (settingsErr) {
            console.error("Failed to load settings in client cancel route (non-blocking):", settingsErr);
          }

          await sendOperatorDecisionEmail({
            email: requestData.company.email,
            name: requestData.requestor?.name || "Operador",
            requestData,
            decision: "cancelled",
            ccEmails
          });
        }
      } catch (emailErr) {
        console.error("Falha ao enviar e-mail de cancelamento para o operador:", emailErr);
      }

      return NextResponse.json({
        success: true,
        message: "Solicitação cancelada com sucesso!",
      });
    } else {
      // Sandbox mode mock
      console.log(`[SANDBOX] Solicitação #${requestId} cancelada pelo operador.`);
      return NextResponse.json({
        success: true,
        message: "[SIMULAÇÃO] Solicitação cancelada com sucesso!",
        mock: true
      });
    }
  } catch (error) {
    console.error("API Error in client cancel route:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar cancelamento: " + error.message },
      { status: 500 }
    );
  }
}
