import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { generateRequestPdf } from "@/lib/pdf-generator";
import { sendUserConfirmationEmail, sendAdminPreNotificationEmail } from "@/lib/brevo";
import crypto from "crypto";

export async function POST(req) {
  try {
    const data = await req.json();

    // 1. Authenticate user if headers are provided and SDK is configured
    let userId = data.userId || "anonymous";
    const authHeader = req.headers.get("authorization");
    
    if (authHeader && authHeader.startsWith("Bearer ") && adminAuth) {
      try {
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        userId = decodedToken.uid;
      } catch (err) {
        console.error("Token verification failed:", err);
        return NextResponse.json(
          { error: "Sessão expirada ou token inválido. Por favor, faça login novamente." },
          { status: 401 }
        );
      }
    }

    // 2. Form Validation
    const { company, aircraft, requestor, pilot, serviceType, period } = data;
    if (!company?.email || !requestor?.name || !period?.start || !period?.end) {
      return NextResponse.json(
        { error: "Dados incompletos fornecidos no formulário." },
        { status: 400 }
      );
    }

    // 3. Generate Request ID and Security Confirmation Token
    const requestId = adminDb 
      ? adminDb.collection("requests").doc().id 
      : `req_${crypto.randomBytes(8).toString("hex")}`;
    const token = crypto.randomBytes(24).toString("hex");

    const requestData = {
      id: requestId,
      userId,
      status: "pending_confirmation",
      approvalStatus: "waiting_confirmation",
      token,
      company,
      aircraft,
      requestor,
      pilot,
      serviceType,
      period,
      notes: data.notes || "",
      createdAt: new Date().toISOString(),
    };

    // 4. Persist request in Firestore
    if (adminDb) {
      await adminDb.collection("requests").doc(requestId).set(requestData);
    } else {
      console.log(`[SANDBOX] Solicitação #${requestId} pré-registrada.`);
      global.lastMockRequest = requestData;
    }

    // 5. Generate PDF
    let pdfBase64;
    try {
      const pdfBuffer = await generateRequestPdf(requestData);
      pdfBase64 = pdfBuffer.toString("base64");
    } catch (pdfErr) {
      console.error("Error generating PDF:", pdfErr);
      return NextResponse.json(
        { error: "Erro ao gerar o documento PDF da solicitação." },
        { status: 500 }
      );
    }

    // 6. Build User Confirmation Link
    const host = process.env.NEXT_PUBLIC_APP_URL || req.headers.get("origin") || "http://localhost:3000";
    const confirmationUrl = `${host}/confirm?id=${requestId}&token=${token}`;

    // 7. Dispatch user confirmation email with the PDF attachment
    const emailResult = await sendUserConfirmationEmail({
      email: company.email,
      name: requestor.name,
      confirmationUrl,
      pdfBase64,
      requestId,
    });

    if (!emailResult.success) {
      console.error("Failed to send email:", emailResult.error);
      return NextResponse.json(
        { error: "Falha ao enviar e-mail de confirmação para " + company.email },
        { status: 500 }
      );
    }

    // 8. Load admin settings and dispatch pre-notification email to admin
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
        }
      } catch (settingsErr) {
        console.error("Error loading admin settings from Firestore on requests:", settingsErr);
      }
    }

    try {
      await sendAdminPreNotificationEmail({
        adminEmail,
        requestData,
        pdfBase64,
        subjectPrefix,
      });
    } catch (adminEmailErr) {
      console.error("Failed to send pre-notification to admin (non-blocking):", adminEmailErr);
    }

    return NextResponse.json({
      success: true,
      requestId,
      message: "Pré-solicitação registrada. Por favor, verifique seu e-mail para confirmar e enviar oficialmente.",
    });

  } catch (error) {
    console.error("API Error in requests route:", error);
    return NextResponse.json(
      { error: "Ocorreu um erro interno ao processar a solicitação." },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  try {
    let userId = "anonymous";
    const authHeader = req.headers.get("authorization");
    
    if (authHeader && authHeader.startsWith("Bearer ") && adminAuth) {
      try {
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        userId = decodedToken.uid;
      } catch (err) {
        console.error("Token verification failed:", err);
        return NextResponse.json(
          { error: "Sessão expirada. Por favor, faça login novamente." },
          { status: 401 }
        );
      }
    } else {
      const { searchParams } = new URL(req.url);
      userId = searchParams.get("userId") || "mock-user-123";
    }

    if (adminDb) {
      const requestsSnap = await adminDb
        .collection("requests")
        .where("userId", "==", userId)
        .get();

      const requests = [];
      requestsSnap.forEach((doc) => {
        requests.push({ id: doc.id, ...doc.data() });
      });

      // Sort by createdAt descending in-memory to avoid Firestore composite index issues
      requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return NextResponse.json({ success: true, requests });
    } else {
      // Sandbox mode: Mock request for testing/evaluation
      const mockUserRequests = [
        {
          id: "req_dce9afbfea3d75f5",
          status: "pending_confirmation",
          approvalStatus: "waiting_confirmation",
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          company: {
            name: "NAV Brasil - DNIZ",
            taxId: "09.876.543/0001-21",
            email: "wilkson.carvalho@navbrasil.gov.br",
            phone: "(99) 98765-4321",
            address: "Av. Aeroporto, SBIZ, Hangar 2"
          },
          aircraft: {
            operator: "Táxi Aéreo DNIZ",
            typeQty: "C208 / 1",
            registration: "PT-XYZ"
          },
          requestor: {
            name: "WILKSON",
            role: "Operador de Voo",
            billingEmail: "financeiro.taxi@dniz.com.br"
          },
          pilot: {
            name: "Gabriel Martins",
            anacCode: "214589"
          },
          serviceType: "Geral (Executiva)",
          period: {
            start: new Date(Date.now() + 7200000).toISOString(),
            end: new Date(Date.now() + 14400000).toISOString()
          },
          notes: "Solicitação emergencial para transporte de valores."
        }
      ];
      return NextResponse.json({ success: true, requests: mockUserRequests, mock: true });
    }
  } catch (error) {
    console.error("API error in requests GET:", error);
    return NextResponse.json(
      { error: "Erro ao buscar histórico de solicitações: " + error.message },
      { status: 500 }
    );
  }
}
