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

    // 2. Check if aircraft/operator is delinquent
    let isDelinquent = false;
    const registrationToCheck = dbData.aircraft?.registration?.trim()?.toUpperCase();
    const taxIdToCheck = dbData.company?.taxId?.trim();

    if (adminDb) {
      // A. Check by registration
      if (registrationToCheck) {
        const snap = await adminDb.collection("delinquents")
          .where("registration", "==", registrationToCheck)
          .get();
        if (!snap.empty) {
          isDelinquent = true;
        }
      }

      // B. Check by taxId (CNPJ/CPF)
      if (!isDelinquent && taxIdToCheck) {
        const snap = await adminDb.collection("delinquents")
          .where("taxId", "==", taxIdToCheck)
          .get();
        if (!snap.empty) {
          isDelinquent = true;
        } else {
          // Normalize and perform fallback comparison
          const normalizedTaxIdToCheck = taxIdToCheck.replace(/\D/g, "");
          if (normalizedTaxIdToCheck) {
            const allDelinquentsSnap = await adminDb.collection("delinquents").get();
            allDelinquentsSnap.forEach((doc) => {
              const d = doc.data();
              if (d.taxId && d.taxId.replace(/\D/g, "") === normalizedTaxIdToCheck) {
                isDelinquent = true;
              }
            });
          }
        }
      }
    } else {
      // Sandbox check
      const mockDelinquents = global.mockDelinquents || [
        { registration: "PT-XYZ", taxId: "12.345.678/0001-90" }
      ];
      const normalizedTaxIdToCheck = taxIdToCheck ? taxIdToCheck.replace(/\D/g, "") : "";
      
      isDelinquent = mockDelinquents.some((d) => {
        const regMatch = registrationToCheck && d.registration?.trim()?.toUpperCase() === registrationToCheck;
        const normalizedDTaxId = d.taxId ? d.taxId.replace(/\D/g, "") : "";
        const taxMatch = normalizedTaxIdToCheck && normalizedDTaxId === normalizedTaxIdToCheck;
        return regMatch || taxMatch;
      });
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

      // Notify the shift operator (OEA) if configured
      try {
        let operatorsEmails = "";
        if (adminDb) {
          const settingsSnap = await adminDb.collection("config").doc("settings").get();
          if (settingsSnap.exists) {
            const settings = settingsSnap.data();
            operatorsEmails = settings.operatorsEmails || "";
          }
        } else {
          // Sandbox fallback
          operatorsEmails = "Tahan: tahan.teste@navbrasil.gov.br\nWilkson: wilkson.teste@navbrasil.gov.br";
        }

        if (operatorsEmails.trim()) {
          // 1. Identify shift operator from scale
          const { getOperatorFromScale } = await import("@/lib/escala-server");
          const escalaOperatorName = await getOperatorFromScale(requestData.period.start);

          if (escalaOperatorName) {
            // 2. Parse mapping list into a dictionary
            const dict = {};
            operatorsEmails.split("\n").forEach(line => {
              const idx = line.indexOf(":");
              if (idx !== -1) {
                const name = line.substring(0, idx).trim();
                const email = line.substring(idx + 1).trim();
                if (name && email) {
                  dict[name.toLowerCase()] = email;
                }
              }
            });

            // 3. Find matching email for operator
            const clean = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const targetClean = clean(escalaOperatorName);
            let matchedEmail = dict[targetClean] || null;
            let matchedName = escalaOperatorName;

            if (!matchedEmail) {
              const keys = Object.keys(dict);
              for (const key of keys) {
                const keyClean = clean(key);
                if (keyClean === targetClean) {
                  matchedEmail = dict[key];
                  matchedName = key;
                  break;
                }
              }
            }

            if (!matchedEmail) {
              const targetParts = targetClean.split(/\s+/);
              const keys = Object.keys(dict);
              for (const key of keys) {
                const keyClean = clean(key);
                const keyParts = keyClean.split(/\s+/);
                const hasOverlap = targetParts.some(p => keyParts.includes(p));
                if (hasOverlap) {
                  matchedEmail = dict[key];
                  matchedName = key;
                  break;
                }
              }
            }

            // 4. Send email if matched
            if (matchedEmail) {
              console.log(`[OEA Notif] Match found: Operator "${escalaOperatorName}" matches mapped operator "${matchedName}" with email "${matchedEmail}". Sending email...`);
              const { sendOperatorNotificationEmail } = await import("@/lib/brevo");
              const opEmailResult = await sendOperatorNotificationEmail({
                operatorEmail: matchedEmail,
                operatorName: matchedName,
                requestData,
                pdfBase64,
                subjectPrefix,
              });
              if (opEmailResult.success) {
                console.log(`[OEA Notif] Notification email sent successfully to ${matchedEmail}`);
              } else {
                console.error(`[OEA Notif] Failed to send email to ${matchedEmail}:`, opEmailResult.error);
              }
            } else {
              console.warn(`[OEA Notif] Operator "${escalaOperatorName}" found on scale but no mapped email was found in settings.`);
            }
          } else {
            console.warn("[OEA Notif] No operator identified from scale for the requested period start.");
          }
        }
      } catch (opNotifErr) {
        console.error("Error in OEA operator notification flow (non-blocking):", opNotifErr);
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
