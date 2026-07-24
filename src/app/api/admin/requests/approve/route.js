import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req) {
  try {
    const { id, decision, justification } = await req.json();

    if (!id || !["authorized", "not_authorized", "cancelled"].includes(decision)) {
      return NextResponse.json(
        { error: "Parâmetros inválidos fornecidos para a aprovação." },
        { status: 400 }
      );
    }

    if (decision === "not_authorized" && (!justification || !justification.trim())) {
      return NextResponse.json(
        { error: "A justificativa é obrigatória para recusar a solicitação." },
        { status: 400 }
      );
    }

    const authorizedAt = new Date().toISOString();

    if (adminDb) {
      const requestRef = adminDb.collection("requests").doc(id);
      const docSnap = await requestRef.get();

      if (!docSnap.exists) {
        return NextResponse.json(
          { error: "Solicitação não encontrada." },
          { status: 404 }
        );
      }

      const requestData = { id: docSnap.id, ...docSnap.data() };

      const updateData = {
        approvalStatus: decision,
        justification: justification || null
      };
      if (decision === "authorized") {
        updateData.authorizedAt = authorizedAt;
      } else if (decision === "cancelled") {
        updateData.cancelledAt = authorizedAt;
      }

      await requestRef.update(updateData);

      console.log(`[FIREBASE] Solicitação #${id} atualizada para approvalStatus: ${decision}`);

      // Dispatch decision email to the operator
      try {
        if (requestData.company?.email) {
          const { sendOperatorDecisionEmail } = await import("@/lib/brevo");

          // Load settings to check for CC emails
          let ccEmails = "";
          try {
            const settingsSnap = await adminDb.collection("config").doc("settings").get();
            if (settingsSnap.exists) {
              ccEmails = settingsSnap.data().ccDecisionEmails || "";
            }
          } catch (settingsErr) {
            console.error("Failed to load settings in approval route (non-blocking):", settingsErr);
          }

          await sendOperatorDecisionEmail({
            email: requestData.company.email,
            name: requestData.requestor?.name || "Operador",
            requestData,
            decision,
            ccEmails,
            justification
          });
          console.log(`[EMAIL] E-mail de decisão enviado com sucesso para ${requestData.company.email} com cópia para: ${ccEmails} e justificativa: ${justification}`);
        }
      } catch (emailErr) {
        console.error("Falha ao enviar e-mail de decisão para o operador:", emailErr);
      }
    } else {
      console.log(`[SANDBOX] Admin tomou decisão para #${id}: ${decision}`);
      console.log(`[MOCK EMAIL SENT] E-mail de decisão enviado para operador com status: ${decision}`);
    }

    let decisionMsg = "autorizada";
    if (decision === "not_authorized") decisionMsg = "recusada";
    if (decision === "cancelled") decisionMsg = "cancelada";

    return NextResponse.json({
      success: true,
      message: `Solicitação ${decisionMsg} com sucesso!`,
    });

  } catch (error) {
    console.error("API Error in admin approve route:", error);
    return NextResponse.json(
      { error: "Erro interno ao registrar decisão do administrador: " + error.message },
      { status: 500 }
    );
  }
}
