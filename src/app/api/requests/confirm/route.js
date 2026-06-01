import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { generateRequestPdf } from "@/lib/pdf-generator";
import { sendAdminNotificationEmail } from "@/lib/brevo";

export async function POST(req) {
  try {
    const { id, token } = await req.json();

    if (!id || !token) {
      return NextResponse.json(
        { error: "ID de solicitação ou token de segurança inválidos." },
        { status: 400 }
      );
    }

    let requestData = null;
    const confirmationIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    const confirmedAt = new Date().toISOString();

    let dbData = null;
    
    // 1. Fetch request details
    if (adminDb) {
      const requestRef = adminDb.collection("requests").doc(id);
      const docSnap = await requestRef.get();

      if (!docSnap.exists) {
        return NextResponse.json(
          { error: "Solicitação não encontrada." },
          { status: 404 }
        );
      }

      dbData = docSnap.data();

      // Validate security token
      if (dbData.token !== token) {
        return NextResponse.json(
          { error: "Token de segurança inválido ou expirado." },
          { status: 403 }
        );
      }

      // If already confirmed, bypass sending again to prevent administration spam
      if (dbData.status === "confirmed") {
        return NextResponse.json({
          success: true,
          alreadyConfirmed: true,
          companyName: dbData.company.name,
          period: dbData.period,
          aircraftTypeQty: dbData.aircraft.typeQty,
          message: "Esta solicitação já foi confirmada anteriormente.",
        });
      }
    } else {
      // Sandbox fallback (use global.lastMockRequest or construct fallback)
      if (global.lastMockRequest && global.lastMockRequest.id === id) {
        dbData = global.lastMockRequest;
      } else {
        dbData = {
          id,
          token,
          status: "pending_confirmation",
          company: {
            name: "Empresa Aérea Simulação Ltda",
            taxId: "12.345.678/0001-90",
            email: "operador.teste@exemplo.com",
            phone: "(99) 98888-7777",
            address: "Aeródromo DNIZ, SBIZ, Box 04"
          },
          aircraft: {
            operator: "Táxi Aéreo DNIZ",
            typeQty: "C208 / 1",
            registration: "PT-XYZ"
          },
          requestor: {
            name: "Pedro Alvares Cabral",
            role: "Despachante Operacional",
            billingEmail: "financeiro.brasil@exemplo.com"
          },
          pilot: {
            name: "João da Silva",
            anacCode: "987654"
          },
          serviceType: "Geral (Executiva)",
          period: {
            start: new Date(Date.now() + 3600000).toISOString(),
            end: new Date(Date.now() + 10800000).toISOString()
          },
          notes: "Voo aero-médico urgente em trânsito."
        };
      }
    }

    // 2. Check if aircraft is delinquent
    let isDelinquent = false;
    const registrationToCheck = dbData.aircraft?.registration?.trim()?.toUpperCase();
    if (registrationToCheck) {
      if (adminDb) {
        const snap = await adminDb.collection("delinquents")
          .where("registration", "==", registrationToCheck)
          .get();
        if (!snap.empty) {
          isDelinquent = true;
        }
      } else {
        // Sandbox check
        const mockDelinquents = global.mockDelinquents || [
          { registration: "PT-XYZ" }
        ];
        isDelinquent = mockDelinquents.some(d => d.registration?.trim()?.toUpperCase() === registrationToCheck);
      }
    }

    // 3. Define requestData and persist updates
    if (isDelinquent) {
      requestData = {
        ...dbData,
        status: "confirmed",
        approvalStatus: "not_authorized",
        rejectionReason: "delinquent_aircraft",
        confirmedAt,
        confirmationIp,
      };

      if (adminDb) {
        await adminDb.collection("requests").doc(id).update({
          status: "confirmed",
          approvalStatus: "not_authorized",
          rejectionReason: "delinquent_aircraft",
          confirmedAt,
          confirmationIp,
        });
      } else {
        global.lastMockRequest = requestData;
      }
    } else {
      requestData = {
        ...dbData,
        status: "confirmed",
        approvalStatus: "pending_analysis",
        confirmedAt,
        confirmationIp,
      };

      if (adminDb) {
        await adminDb.collection("requests").doc(id).update({
          status: "confirmed",
          approvalStatus: "pending_analysis",
          confirmedAt,
          confirmationIp,
        });
      } else {
        global.lastMockRequest = requestData;
      }
    }

    // 4. Regenerate PDF
    let pdfBase64;
    try {
      const pdfBuffer = await generateRequestPdf(requestData);
      pdfBase64 = pdfBuffer.toString("base64");
    } catch (pdfErr) {
      console.error("Error generating final PDF:", pdfErr);
      return NextResponse.json(
        { error: "Erro ao atualizar o documento PDF." },
        { status: 500 }
      );
    }

    // 5. Send emails
    let adminEmail = process.env.AIRPORT_ADMIN_EMAIL || "administracao.sbiz@localhost.com";
    let subjectPrefix = "SOLICITAÇÃO DE PRORROGAÇÃO DE HORÁRIO - SBIZ";

    if (adminDb) {
      try {
        const settingsSnap = await adminDb.collection("config").doc("settings").get();
        if (settingsSnap.exists) {
          const settings = settingsSnap.data();
          if (settings.airportAdminEmail) {
            adminEmail = settings.airportAdminEmail;
          }
          if (settings.emailSubjectPrefix) {
            subjectPrefix = settings.emailSubjectPrefix;
          }
          if (settings.customNotes) {
            requestData.customAdminNotes = settings.customNotes;
          }
        }
      } catch (settingsErr) {
        console.error("Error loading admin settings from Firestore:", settingsErr);
      }
    }

    if (isDelinquent) {
      // Send delinquent rejection email to operator
      const { sendDelinquentRejectionEmail } = await import("@/lib/brevo");
      await sendDelinquentRejectionEmail({
        email: requestData.company.email,
        name: requestData.requestor?.name || "Operador",
        requestData,
      });

      // Send delinquent notification to admin
      const emailResult = await sendAdminNotificationEmail({
        adminEmail,
        requestData,
        pdfBase64,
        subjectPrefix: `[REPROVADA - INADIMPLENTE] ${subjectPrefix}`,
      });

      if (!emailResult.success) {
        console.error("Failed to notify administration about delinquent rejection:", emailResult.error);
      }

      return NextResponse.json({
        success: true,
        alreadyConfirmed: false,
        isDelinquent: true,
        companyName: requestData.company.name,
        period: requestData.period,
        aircraftTypeQty: requestData.aircraft.typeQty,
        message: "Solicitação confirmada e INDEFERIDA automaticamente devido a inadimplência da aeronave.",
      });
    } else {
      // Normal flow: notify admin
      const emailResult = await sendAdminNotificationEmail({
        adminEmail,
        requestData,
        pdfBase64,
        subjectPrefix,
      });

      if (!emailResult.success) {
        console.error("Failed to notify administration:", emailResult.error);
        return NextResponse.json(
          { error: "A solicitação foi confirmada no sistema, mas houve uma falha ao enviar o e-mail oficial para a administração." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        alreadyConfirmed: false,
        isDelinquent: false,
        companyName: requestData.company.name,
        period: requestData.period,
        aircraftTypeQty: requestData.aircraft.typeQty,
        message: "Solicitação confirmada com sucesso! O e-mail oficial foi encaminhado para a administração do aeroporto.",
      });
    }

  } catch (error) {
    console.error("API Error in request confirm route:", error);
    return NextResponse.json(
      { error: "Ocorreu um erro interno ao processar a confirmação." },
      { status: 500 }
    );
  }
}
