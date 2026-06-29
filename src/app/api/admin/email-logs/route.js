import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/brevo";

export async function GET(req) {
  try {
    if (adminDb) {
      const snap = await adminDb
        .collection("email_logs")
        .orderBy("sentAt", "desc")
        .get();

      const logs = [];
      snap.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() });
      });

      return NextResponse.json({ success: true, logs });
    } else {
      // Sandbox fallback data
      if (!global.mockEmailLogs) {
        global.mockEmailLogs = [
          {
            id: "log_mock_1",
            requestId: "req_dce9afbfea3d75f5",
            emailType: "user_confirmation",
            to: [{ email: "wilkson.carvalho@navbrasil.gov.br", name: "WILKSON" }],
            subject: "SBIZ - Confirme sua solicitação de prorrogação #FEA3D7",
            sentAt: new Date(Date.now() - 3600000).toISOString(),
            status: "failed",
            error: "Brevo API Error (401): Unauthorized - Invalid API Key",
            payload: {
              to: [{ email: "wilkson.carvalho@navbrasil.gov.br", name: "WILKSON" }],
              subject: "SBIZ - Confirme sua solicitação de prorrogação #FEA3D7",
              htmlContent: "<p>Olá WILKSON, por favor confirme sua solicitação...</p>",
              pdfBase64: "dGVzdC1wZGY=",
              attachmentName: "solicitacao_prorrogacao_FEA3D7.pdf"
            }
          },
          {
            id: "log_mock_2",
            requestId: "req_dce9afbfea3d75f5",
            emailType: "admin_pre_notification",
            to: [{ email: "administracao.sbiz@localhost.com", name: "Admin" }],
            subject: "[PRÉ-REGISTRO] SOLICITAÇÃO DE PRORROGAÇÃO DE HORÁRIO - SBIZ #FEA3D7",
            sentAt: new Date(Date.now() - 3590000).toISOString(),
            status: "sent",
            error: null,
            payload: {
              to: [{ email: "administracao.sbiz@localhost.com", name: "Admin" }],
              subject: "[PRÉ-REGISTRO] SOLICITAÇÃO DE PRORROGAÇÃO DE HORÁRIO - SBIZ #FEA3D7",
              htmlContent: "<p>Uma pré-solicitação foi criada...</p>",
              pdfBase64: "dGVzdC1wZGY=",
              attachmentName: "RASCUNHO_solicitacao_SBIZ_FEA3D7.pdf"
            }
          }
        ];
      }
      return NextResponse.json({ success: true, logs: global.mockEmailLogs, mock: true });
    }
  } catch (error) {
    console.error("GET email logs error:", error);
    return NextResponse.json(
      { error: "Erro ao obter logs de e-mail: " + error.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const { action, logId, requestId } = await req.json();

    if (action === "resend") {
      if (!logId) {
        return NextResponse.json({ error: "Parâmetro logId ausente." }, { status: 400 });
      }

      let logData = null;

      if (adminDb) {
        const logSnap = await adminDb.collection("email_logs").doc(logId).get();
        if (!logSnap.exists) {
          return NextResponse.json({ error: "Log de e-mail não encontrado." }, { status: 404 });
        }
        logData = logSnap.data();
      } else {
        // Sandbox fallback
        if (global.mockEmailLogs) {
          logData = global.mockEmailLogs.find((l) => l.id === logId);
        }
        if (!logData) {
          return NextResponse.json({ error: "Log de e-mail não encontrado (Sandbox)." }, { status: 404 });
        }
      }

      const { to, subject, htmlContent, pdfBase64, attachmentName } = logData.payload || {};

      if (!to || !subject || !htmlContent) {
        return NextResponse.json({ error: "Dados de envio ausentes no log selecionado." }, { status: 400 });
      }

      console.log(`[Resend Action] Resending email type "${logData.emailType}" for request "${logData.requestId}"`);

      // Attempt raw resend (which wraps it into a new log entry via sendEmail)
      const resendResult = await sendEmail({
        to,
        subject,
        htmlContent,
        pdfBase64,
        attachmentName,
        requestId: logData.requestId,
        emailType: logData.emailType,
      });

      // Update original log status to represent the new attempt status
      if (resendResult.success) {
        if (adminDb) {
          await adminDb.collection("email_logs").doc(logId).update({
            status: "sent",
            error: null,
            sentAt: new Date().toISOString(),
          });
        } else {
          const l = global.mockEmailLogs.find((l) => l.id === logId);
          if (l) {
            l.status = "sent";
            l.error = null;
            l.sentAt = new Date().toISOString();
          }
        }
        return NextResponse.json({ success: true, message: "E-mail reenviado com sucesso!" });
      } else {
        if (adminDb) {
          await adminDb.collection("email_logs").doc(logId).update({
            status: "failed",
            error: resendResult.error || "Erro desconhecido ao reenviar",
            sentAt: new Date().toISOString(),
          });
        } else {
          const l = global.mockEmailLogs.find((l) => l.id === logId);
          if (l) {
            l.status = "failed";
            l.error = resendResult.error || "Erro desconhecido ao reenviar";
            l.sentAt = new Date().toISOString();
          }
        }
        return NextResponse.json(
          { error: "Falha ao reenviar e-mail: " + resendResult.error },
          { status: 500 }
        );
      }
    }

    if (action === "confirm-manual") {
      if (!requestId) {
        return NextResponse.json({ error: "Parâmetro requestId ausente." }, { status: 400 });
      }

      let requestData = null;
      const confirmedAt = new Date().toISOString();
      const confirmationIp = "admin_manual_confirm";

      // 1. Fetch request details
      if (adminDb) {
        const docSnap = await adminDb.collection("requests").doc(requestId).get();
        if (!docSnap.exists) {
          return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
        }
        requestData = docSnap.data();
      } else {
        // Sandbox fallback
        if (global.mockRequests) {
          requestData = global.mockRequests.find((r) => r.id === requestId);
        }
        if (!requestData) {
          return NextResponse.json({ error: "Solicitação não encontrada (Sandbox)." }, { status: 404 });
        }
      }

      // Check if already confirmed
      if (requestData.status === "confirmed") {
        return NextResponse.json({ success: true, message: "Solicitação já se encontra confirmada." });
      }

      // 2. Check if aircraft/operator is delinquent
      let isDelinquent = false;
      const registrationToCheck = requestData.aircraft?.registration?.trim()?.toUpperCase();
      const taxIdToCheck = requestData.company?.taxId?.trim();

      if (adminDb) {
        if (registrationToCheck) {
          const snap = await adminDb.collection("delinquents")
            .where("registration", "==", registrationToCheck)
            .get();
          if (!snap.empty) {
            isDelinquent = true;
          }
        }

        if (!isDelinquent && taxIdToCheck) {
          const snap = await adminDb.collection("delinquents")
            .where("taxId", "==", taxIdToCheck)
            .get();
          if (!snap.empty) {
            isDelinquent = true;
          } else {
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
        const mockDelinquents = global.mockDelinquents || [];
        const normalizedTaxIdToCheck = taxIdToCheck ? taxIdToCheck.replace(/\D/g, "") : "";
        isDelinquent = mockDelinquents.some((d) => {
          const regMatch = registrationToCheck && d.registration?.trim()?.toUpperCase() === registrationToCheck;
          const normalizedDTaxId = d.taxId ? d.taxId.replace(/\D/g, "") : "";
          const taxMatch = normalizedTaxIdToCheck && normalizedDTaxId === normalizedTaxIdToCheck;
          return regMatch || taxMatch;
        });
      }

      // 3. Define updated data
      const updatedRequestData = {
        ...requestData,
        status: "confirmed",
        approvalStatus: isDelinquent ? "not_authorized" : "pending_analysis",
        rejectionReason: isDelinquent ? "delinquent_aircraft" : null,
        confirmedAt,
        confirmationIp,
      };

      // Persist updates
      if (adminDb) {
        await adminDb.collection("requests").doc(requestId).set(updatedRequestData);
      } else {
        const idx = global.mockRequests.findIndex(r => r.id === requestId);
        if (idx !== -1) {
          global.mockRequests[idx] = updatedRequestData;
        }
      }

      // 4. Regenerate PDF
      let pdfBase64;
      try {
        const { generateRequestPdf } = await import("@/lib/pdf-generator");
        const pdfBuffer = await generateRequestPdf(updatedRequestData);
        pdfBase64 = pdfBuffer.toString("base64");
      } catch (pdfErr) {
        console.error("Error generating final PDF on manual confirm:", pdfErr);
        return NextResponse.json(
          { error: "Erro ao gerar o documento PDF atualizado." },
          { status: 500 }
        );
      }

      // 5. Load settings
      let adminEmail = process.env.AIRPORT_ADMIN_EMAIL || "administracao.sbiz@localhost.com";
      let subjectPrefix = "SOLICITAÇÃO DE PRORROGAÇÃO DE HORÁRIO - SBIZ";

      if (adminDb) {
        try {
          const settingsSnap = await adminDb.collection("config").doc("settings").get();
          if (settingsSnap.exists) {
            const settings = settingsSnap.data();
            if (settings.airportAdminEmail) adminEmail = settings.airportAdminEmail;
            if (settings.emailSubjectPrefix) subjectPrefix = settings.emailSubjectPrefix;
            if (settings.customNotes) updatedRequestData.customAdminNotes = settings.customNotes;
          }
        } catch (settingsErr) {
          console.error("Error loading admin settings on manual confirm:", settingsErr);
        }
      }

      // 6. Send notification emails
      if (isDelinquent) {
        // Send delinquent rejection email to operator
        try {
          const { sendDelinquentRejectionEmail, sendAdminNotificationEmail } = await import("@/lib/brevo");
          await sendDelinquentRejectionEmail({
            email: updatedRequestData.company.email,
            name: updatedRequestData.requestor?.name || "Operador",
            requestData: updatedRequestData,
          });

          // Send delinquent notification to admin
          await sendAdminNotificationEmail({
            adminEmail,
            requestData: updatedRequestData,
            pdfBase64,
            subjectPrefix: `[REPROVADA - INADIMPLENTE] ${subjectPrefix}`,
          });
        } catch (err) {
          console.error("Error sending delinquent emails on manual confirm:", err);
        }
      } else {
        // Normal flow
        try {
          const { sendAdminNotificationEmail } = await import("@/lib/brevo");
          await sendAdminNotificationEmail({
            adminEmail,
            requestData: updatedRequestData,
            pdfBase64,
            subjectPrefix,
          });
        } catch (err) {
          console.error("Failed to notify admin on manual confirm:", err);
        }

        // Notify the shift operators (OEA) if configured
        try {
          let operatorsEmails = "";
          if (adminDb) {
            const settingsSnap = await adminDb.collection("config").doc("settings").get();
            if (settingsSnap.exists) {
              const settings = settingsSnap.data();
              operatorsEmails = settings.operatorsEmails || "";
            }
          } else {
            operatorsEmails = "Tahan: tahan.teste@navbrasil.gov.br\nWilkson: wilkson.teste@navbrasil.gov.br";
          }

          if (operatorsEmails.trim()) {
            const { getOperatorsFromScale } = await import("@/lib/escala-server");
            const escalaOperators = await getOperatorsFromScale(updatedRequestData.period.start);

            if (escalaOperators && escalaOperators.length > 0) {
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

              for (const escalaOperatorName of escalaOperators) {
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

                if (matchedEmail) {
                  const { sendOperatorNotificationEmail } = await import("@/lib/brevo");
                  await sendOperatorNotificationEmail({
                    operatorEmail: matchedEmail,
                    operatorName: matchedName,
                    requestData: updatedRequestData,
                    pdfBase64,
                    subjectPrefix,
                  });
                }
              }
            }
          }
        } catch (opNotifErr) {
          console.error("Error in OEA operators notification flow on manual confirm:", opNotifErr);
        }
      }

      return NextResponse.json({
        success: true,
        message: "Solicitação confirmada manualmente com sucesso!",
      });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });

  } catch (error) {
    console.error("POST email logs error:", error);
    return NextResponse.json(
      { error: "Erro ao processar ação nos logs: " + error.message },
      { status: 500 }
    );
  }
}
