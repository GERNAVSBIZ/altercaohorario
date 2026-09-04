import { adminDb } from "@/lib/firebase-admin";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "no-reply@sbiz.gov.br";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "SBIZ - Operações Aeroportuárias";

function formatIntentions(intentions) {
  if (!intentions) return "Não especificada";
  const list = [];
  if (intentions.decolagem) list.push("Decolagem");
  if (intentions.pouso) list.push("Pouso");
  if (intentions.alternativa) list.push("Alternativa");
  return list.length > 0 ? list.join(", ") : "Nenhuma";
}

function getLateRequestHtml(requestData) {
  if (!requestData || !requestData.lateRequest) return "";
  
  const required = requestData.lateRequestDetails?.requiredHours || 0;
  const actual = requestData.lateRequestDetails?.actualHours || 0;
  
  return `
    <div style="background-color: #fff5f5; border: 1.5px solid #ff8787; padding: 14px; margin: 15px 0; border-radius: 6px; font-size: 13.5px; color: #c92a2a; line-height: 1.5;">
      <strong style="font-size: 14.5px;">⚠️ ATENÇÃO: SOLICITAÇÃO FORA DO PRAZO REGULAMENTAR</strong><br/>
      De acordo com o <strong>MCA 102-7 (itens 15.3.3.1 e 15.3.3.2)</strong>, esta solicitação infringe o prazo mínimo regulamentar.<br/>
      <strong>Antecedência exigida:</strong> ${required}h | <strong>Antecedência realizada:</strong> ${actual}h.<br/>
      Este pedido foi submetido pelo operador e requer análise e deliberação excepcional pela Gerência da Dependência (DNB).
    </div>
  `;
}

/**
 * Sends a transactional email via Brevo (raw).
 * If API key is missing or is placeholder, logs contents to console.
 */
async function sendEmailRaw({ to, subject, htmlContent, attachmentName, pdfBase64 }) {
  const isPlaceholder = !BREVO_API_KEY || BREVO_API_KEY.includes("PLACEHOLDER");

  if (isPlaceholder) {
    console.log("\n================ [MOCK EMAIL SENT] ================");
    console.log(`Para:      ${to.map(t => `${t.name} <${t.email}>`).join(", ")}`);
    console.log(`Assunto:   ${subject}`);
    console.log(`Remetente: ${BREVO_SENDER_NAME} <${BREVO_SENDER_EMAIL}>`);
    console.log("------------------ CONTEÚDO HTML ------------------");
    console.log(htmlContent);
    console.log("---------------------------------------------------");
    if (pdfBase64) {
      console.log(`Anexo:     [PDF] ${attachmentName} (${Math.round(pdfBase64.length * 0.75 / 1024)} KB)`);
    }
    console.log("===================================================\n");
    return { success: true, mock: true };
  }

  try {
    const payload = {
      sender: {
        name: BREVO_SENDER_NAME,
        email: BREVO_SENDER_EMAIL,
      },
      to,
      subject,
      htmlContent,
    };

    if (pdfBase64 && attachmentName) {
      payload.attachment = [
        {
          name: attachmentName,
          content: pdfBase64,
        },
      ];
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API Error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Failed to send email via Brevo:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Wrapper for sending email, logging it to Firestore, and alerting admins on failure.
 */
export async function sendEmail({
  to,
  subject,
  htmlContent,
  attachmentName = null,
  pdfBase64 = null,
  requestId = null,
  emailType = "unknown",
  skipNotificationOnFailure = false
}) {
  let status = "sent";
  let errorMsg = null;
  let result = null;

  try {
    result = await sendEmailRaw({ to, subject, htmlContent, attachmentName, pdfBase64 });
    if (!result.success) {
      status = "failed";
      errorMsg = result.error || "Unknown send error";
    }
  } catch (err) {
    status = "failed";
    errorMsg = err.message;
  }

  // Create log payload
  const logData = {
    requestId,
    emailType,
    to,
    subject,
    sentAt: new Date().toISOString(),
    status,
    error: errorMsg,
    payload: {
      to,
      subject,
      htmlContent,
      pdfBase64: pdfBase64 || null,
      attachmentName: attachmentName || null
    }
  };

  // Persist to database
  if (adminDb) {
    try {
      await adminDb.collection("email_logs").add(logData);
    } catch (dbErr) {
      console.error("Failed to write to email_logs in Firestore:", dbErr);
    }
  } else {
    // Sandbox fallback
    if (!global.mockEmailLogs) {
      global.mockEmailLogs = [];
    }
    const mockLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      ...logData
    };
    global.mockEmailLogs.push(mockLog);
  }

  // Send admin notification on failure (unless skipped to avoid infinite loops)
  if (status === "failed" && !skipNotificationOnFailure && emailType !== "failure_notification") {
    // Attempt to notify the admin about the failure asynchronously (do not block)
    notifyAdminAboutEmailFailure(to.map(t => t.email).join(", "), subject, errorMsg, requestId).catch(err => {
      console.error("Error in async notifyAdminAboutEmailFailure:", err);
    });
  }

  return { success: status === "sent", error: errorMsg, ...result };
}

/**
 * Asynchronously notifies airport administrators when an email fails to send.
 */
async function notifyAdminAboutEmailFailure(recipientEmail, emailSubject, errorMsg, requestId) {
  let adminEmail = process.env.AIRPORT_ADMIN_EMAIL || "administracao.sbiz@localhost.com";
  if (adminDb) {
    try {
      const settingsSnap = await adminDb.collection("config").doc("settings").get();
      if (settingsSnap.exists) {
        const settings = settingsSnap.data();
        if (settings.airportAdminEmail) {
          adminEmail = settings.airportAdminEmail;
        }
      }
    } catch (e) {
      console.error("Error loading admin email for failure notification:", e);
    }
  }

  const subject = `[ALERTA DE FALHA] Falha no Envio de E-mail - Solicitação #${requestId ? requestId.slice(-6).toUpperCase() : 'N/A'}`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ffccd5; border-radius: 8px; color: #333; background-color: #fff5f5;">
      <h2 style="color: #c92a2a; border-bottom: 2px solid #ff8787; padding-bottom: 10px; margin-top: 0;">Alerta de Falha no Envio de E-mail</h2>
      <p>Prezada Administração,</p>
      <p>Ocorreu uma falha ao tentar enviar um e-mail do sistema:</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #555;">Destinatário:</td>
          <td style="padding: 6px 0;">${recipientEmail}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Assunto Original:</td>
          <td style="padding: 6px 0;">${emailSubject}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Erro Retornado:</td>
          <td style="padding: 6px 0; color: #c92a2a; font-weight: bold;">${errorMsg}</td>
        </tr>
        ${requestId ? `
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">ID da Solicitação:</td>
          <td style="padding: 6px 0;"><code>${requestId}</code></td>
        </tr>` : ''}
      </table>
      <p style="margin-top: 20px;">Você pode acessar a aba de <strong>Logs</strong> no painel administrativo para tentar reenviar o e-mail ou confirmar a solicitação manualmente.</p>
    </div>
  `;

  try {
    const emails = typeof adminEmail === 'string'
      ? adminEmail.split(/[,;]/).map(e => e.trim()).filter(Boolean)
      : (Array.isArray(adminEmail) ? adminEmail : []);
    const to = emails.map(email => ({ email, name: "Admin" }));

    await sendEmail({
      to,
      subject,
      htmlContent,
      requestId,
      emailType: "failure_notification",
      skipNotificationOnFailure: true,
    });
  } catch (err) {
    console.error("Failed to send admin email failure notification:", err);
  }
}

/**
 * Sends a confirmation email to the user with the confirmation link and the generated PDF.
 */
export async function sendUserConfirmationEmail({ email, name, confirmationUrl, pdfBase64, requestId, intentions }) {
  const subject = `SBIZ - Confirme sua solicitação de prorrogação #${requestId.slice(-6).toUpperCase()}`;
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333;">
      <h2 style="color: #0b3c5d; border-bottom: 2px solid #ef5b25; padding-bottom: 10px; margin-top: 0;">Confirmação de Solicitação</h2>
      <p>Olá, <strong>${name}</strong>,</p>
      <p>Recebemos o preenchimento dos dados para a prorrogação de horário da NAV Brasil - DNIZ.</p>
      
      <div style="background-color: #f5f5f5; padding: 12px; margin: 15px 0; border-radius: 4px; border: 1px solid #ddd; font-size: 13px;">
        <strong>Intenção de Voo:</strong> ${formatIntentions(intentions)}
      </div>

      <p>O PDF oficial foi gerado e está anexado a este e-mail para sua conferência.</p>
      
      <div style="background-color: #f9f9f9; border-left: 4px solid #ef5b25; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0;">
        <h4 style="margin: 0 0 10px 0; color: #0b3c5d;">IMPORTANTE: Ação Necessária</h4>
        <p style="margin: 0; font-size: 14px;">Para que sua solicitação seja encaminhada e processada oficialmente pela gerência da DNIZ - NAV Brasil, você precisa validar as informações clicando no botão abaixo:</p>
        <div style="text-align: center; margin-top: 20px;">
          <a href="${confirmationUrl}" style="background-color: #ef5b25; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Confirmar e Enviar Solicitação</a>
        </div>
      </div>
      
      <p style="font-size: 12px; color: #777;">Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
      <p style="font-size: 12px; word-break: break-all; color: #ef5b25;"><a href="${confirmationUrl}">${confirmationUrl}</a></p>
      
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #777; text-align: center; margin: 0;">SBIZ - Sistema de Solicitação de Prorrogação de Horário<br/>NAV Brasil - DNIZ</p>
    </div>
  `;

  return sendEmail({
    to: [{ email, name }],
    subject,
    htmlContent,
    attachmentName: `solicitacao_prorrogacao_${requestId.slice(-6).toUpperCase()}.pdf`,
    pdfBase64,
    requestId,
    emailType: "user_confirmation",
  });
}

/**
 * Sends the official request email to the airport administration.
 */
export async function sendAdminNotificationEmail({ adminEmail, requestData, pdfBase64, subjectPrefix }) {
  const idShort = requestData.id.slice(-6).toUpperCase();
  const prefix = subjectPrefix || "SOLICITAÇÃO DE PRORROGAÇÃO DE HORÁRIO - SBIZ";
  const subject = `${prefix} #${idShort} - ${requestData.company.name}`;
  
  const formattedStart = new Date(requestData.period.start).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const formattedEnd = new Date(requestData.period.end).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  // Support comma or semicolon-separated emails
  const emails = typeof adminEmail === 'string'
    ? adminEmail.split(/[,;]/).map(e => e.trim()).filter(Boolean)
    : (Array.isArray(adminEmail) ? adminEmail : []);

  const to = emails.map(email => ({ email, name: "NAV Brasil - DNIZ" }));

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333;">
      <h2 style="color: #0b3c5d; border-bottom: 2px solid #ef5b25; padding-bottom: 10px; margin-top: 0;">Solicitação de Prorrogação de Horário</h2>
      <p>Prezada Administração da NAV Brasil - DNIZ,</p>
      <p>Uma nova solicitação de prorrogação de horário foi <strong>confirmada pelo operador</strong> e está pronta para análise.</p>
      ${getLateRequestHtml(requestData)}
      
      <h3 style="color: #0b3c5d; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Resumo dos Dados</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #555;">Empresa/Entidade:</td>
          <td style="padding: 6px 0;">${requestData.company.name}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">CNPJ/CPF:</td>
          <td style="padding: 6px 0;">${requestData.company.taxId}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Solicitante:</td>
          <td style="padding: 6px 0;">${requestData.requestor.name} (${requestData.requestor.role})</td>
        </tr>
        ${requestData.requestor.billingEmail ? `
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">E-mail Faturamento:</td>
          <td style="padding: 6px 0;">${requestData.requestor.billingEmail}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Período Solicitado:</td>
          <td style="padding: 6px 0; font-weight: bold; color: #ef5b25;">De ${formattedStart} a ${formattedEnd}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Intenção de Voo:</td>
          <td style="padding: 6px 0; font-weight: bold; color: #ef5b25;">${formatIntentions(requestData.intentions)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Espécie do Serviço:</td>
          <td style="padding: 6px 0;">${requestData.serviceType}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Aeronave:</td>
          <td style="padding: 6px 0;">${requestData.aircraft.typeQty} (Operador: ${requestData.aircraft.operator})</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Matrícula:</td>
          <td style="padding: 6px 0; font-weight: bold; color: #ef5b25;">${requestData.aircraft.registration || '-'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Piloto:</td>
          <td style="padding: 6px 0;">${requestData.pilot.name} (ANAC: ${requestData.pilot.anacCode})</td>
        </tr>
        ${requestData.notes ? `
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555; vertical-align: top;">Observações:</td>
          <td style="padding: 6px 0; font-style: italic;">${requestData.notes}</td>
        </tr>` : ''}
      </table>
      
      ${requestData.customAdminNotes ? `
      <div style="background-color: #fff9db; border: 1px solid #ffe066; padding: 12px; margin-top: 20px; border-radius: 4px; font-size: 13px; color: #664d03;">
        <strong>Observação Administrativa Adicionada:</strong><br/>
        ${requestData.customAdminNotes}
      </div>` : ''}

      <p style="margin-top: 20px;">O documento oficial PDF devidamente estruturado encontra-se **anexado a este e-mail**.</p>
      
      <div style="background-color: #f5f5f5; border: 1px solid #ddd; padding: 15px; margin-top: 20px; border-radius: 4px; font-size: 13px;">
        <strong>Informações do Registro:</strong><br/>
        ID da Solicitação: <code style="background-color: #eaeaea; padding: 2px 4px; border-radius: 3px;">${requestData.id}</code><br/>
        Confirmado pelo Usuário em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}<br/>
        E-mail de Contato: ${requestData.company.email}
      </div>

      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #777; text-align: center; margin: 0;">SBIZ - Sistema de Solicitação de Prorrogação de Horário<br/>NAV Brasil - DNIZ</p>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    htmlContent,
    attachmentName: `solicitacao_SBIZ_${idShort}_${requestData.company.name.replace(/\s+/g, '_')}.pdf`,
    pdfBase64,
    requestId: requestData.id,
    emailType: "admin_notification",
  });
}

/**
 * Sends a notification email to the admin when a request is pre-registered (pending operator confirmation).
 */
export async function sendAdminPreNotificationEmail({ adminEmail, requestData, pdfBase64, subjectPrefix }) {
  const idShort = requestData.id.slice(-6).toUpperCase();
  const prefix = subjectPrefix || "SOLICITAÇÃO DE PRORROGAÇÃO DE HORÁRIO - SBIZ";
  const subject = `[PRÉ-REGISTRO] ${prefix} #${idShort} - ${requestData.company.name}`;
  
  const formattedStart = new Date(requestData.period.start).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const formattedEnd = new Date(requestData.period.end).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  // Support comma or semicolon-separated emails
  const emails = typeof adminEmail === 'string'
    ? adminEmail.split(/[,;]/).map(e => e.trim()).filter(Boolean)
    : (Array.isArray(adminEmail) ? adminEmail : []);

  const to = emails.map(email => ({ email, name: "NAV Brasil - DNIZ" }));

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333;">
      <h2 style="color: #0b3c5d; border-bottom: 2px solid #ef5b25; padding-bottom: 10px; margin-top: 0;">Nova Pré-Solicitação Registrada</h2>
      <p>Prezada Administração da NAV Brasil - DNIZ,</p>
      <p>Uma nova solicitação de prorrogação de horário foi pré-registrada no sistema e está <strong>aguardando a confirmação do operador por e-mail</strong> para ser oficialmente validada.</p>
      
      <div style="background-color: #fff9db; border: 1px solid #ffe066; padding: 12px; margin: 15px 0; border-radius: 4px; font-size: 13px; color: #664d03;">
        <strong>Atenção:</strong> Esta solicitação ainda NÃO foi assinada digitalmente pelo operador e não deve ser faturada ou processada até a confirmação definitiva.
      </div>
      ${getLateRequestHtml(requestData)}

      <h3 style="color: #0b3c5d; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Resumo dos Dados</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #555;">Empresa/Entidade:</td>
          <td style="padding: 6px 0;">${requestData.company.name}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">CNPJ/CPF:</td>
          <td style="padding: 6px 0;">${requestData.company.taxId}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Solicitante:</td>
          <td style="padding: 6px 0;">${requestData.requestor.name} (${requestData.requestor.role})</td>
        </tr>
        ${requestData.requestor.billingEmail ? `
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">E-mail Faturamento:</td>
          <td style="padding: 6px 0;">${requestData.requestor.billingEmail}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Período Solicitado:</td>
          <td style="padding: 6px 0; font-weight: bold; color: #ef5b25;">De ${formattedStart} a ${formattedEnd}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Intenção de Voo:</td>
          <td style="padding: 6px 0; font-weight: bold; color: #ef5b25;">${formatIntentions(requestData.intentions)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Espécie do Serviço:</td>
          <td style="padding: 6px 0;">${requestData.serviceType}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Aeronave:</td>
          <td style="padding: 6px 0;">${requestData.aircraft.typeQty} (Operador: ${requestData.aircraft.operator})</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Matrícula:</td>
          <td style="padding: 6px 0; font-weight: bold; color: #ef5b25;">${requestData.aircraft.registration || '-'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Piloto:</td>
          <td style="padding: 6px 0;">${requestData.pilot.name} (ANAC: ${requestData.pilot.anacCode})</td>
        </tr>
        ${requestData.notes ? `
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555; vertical-align: top;">Observações:</td>
          <td style="padding: 6px 0; font-style: italic;">${requestData.notes}</td>
        </tr>` : ''}
      </table>
      
      <p style="margin-top: 20px;">O rascunho do documento oficial PDF encontra-se **anexado a este e-mail**.</p>
      
      <div style="background-color: #f5f5f5; border: 1px solid #ddd; padding: 15px; margin-top: 20px; border-radius: 4px; font-size: 13px;">
        <strong>Informações do Registro:</strong><br/>
        ID da Solicitação: <code style="background-color: #eaeaea; padding: 2px 4px; border-radius: 3px;">${requestData.id}</code><br/>
        Criado em: ${new Date(requestData.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}<br/>
        E-mail do Operador: ${requestData.company.email}
      </div>

      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #777; text-align: center; margin: 0;">SBIZ - Sistema de Solicitação de Prorrogação de Horário<br/>NAV Brasil - DNIZ</p>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    htmlContent,
    attachmentName: `RASCUNHO_solicitacao_SBIZ_${idShort}.pdf`,
    pdfBase64,
    requestId: requestData.id,
    emailType: "admin_pre_notification",
  });
}

/**
 * Sends a notification email to the operator when the admin decides (approves or rejects) a request.
 */
export async function sendOperatorDecisionEmail({ email, name, requestData, decision, ccEmails, justification }) {
  const idShort = requestData.id.slice(-6).toUpperCase();
  const isApproved = decision === "authorized";
  const isCancelled = decision === "cancelled";
  
  let statusLabel = "RECUSADA";
  let statusColor = "#c92a2a";
  let statusBg = "#fff5f5";
  let statusBorder = "#ffc9c9";
  let statusMessage = "Infelizmente a solicitação de prorrogação de horário não pôde ser autorizada pela gerência neste momento.";

  if (isApproved) {
    statusLabel = "AUTORIZADA";
    statusColor = "#2b8a3e";
    statusBg = "#ebfbee";
    statusBorder = "#b2f2bb";
    statusMessage = "O seu voo foi autorizado para operar durante a prorrogação solicitada.";
  } else if (isCancelled) {
    statusLabel = "CANCELADA";
    statusColor = "#e8590c";
    statusBg = "#fff4e6";
    statusBorder = "#ffd8a8";
    statusMessage = "A solicitação de prorrogação de horário foi CANCELADA a pedido do operador da aeronave.";
  }

  const subject = `[${statusLabel}] Solicitação de Prorrogação de Horário #${idShort} - SBIZ`;

  const formattedStart = new Date(requestData.period.start).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const formattedEnd = new Date(requestData.period.end).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333;">
      <h2 style="color: #0b3c5d; border-bottom: 2px solid #ef5b25; padding-bottom: 10px; margin-top: 0;">Status de Solicitação Atualizado</h2>
      <p>Olá, <strong>${name}</strong>,</p>
      <p>A gerência da <strong>DNIZ - NAV Brasil</strong> atualizou a sua solicitação de prorrogação de horário para o Aeroporto de Imperatriz (SBIZ).</p>
      
      <div style="background-color: ${statusBg}; border: 1px solid ${statusBorder}; border-left: 5px solid ${statusColor}; padding: 15px; margin: 20px 0; border-radius: 4px; color: ${statusColor};">
        <h4 style="margin: 0 0 5px 0; font-size: 16px;">Sua solicitação está: <strong>${statusLabel}</strong></h4>
        <p style="margin: 0; font-size: 14px; color: #555;">
          ${statusMessage}
        </p>
      </div>

      ${isApproved ? `
      <div style="background-color: #fff9db; border: 1px solid #ffe066; border-left: 5px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; color: #664d03; font-size: 13.5px; font-weight: bold; line-height: 1.5;">
        ⚠️ ATENÇÃO: Esta autorização restringe-se exclusivamente à NAV Brasil, sendo necessária também a coordenação com a empresa Motiva Aeroportos.<br/><br/>
        📞 CONTATOS: 99-99156 8254<br/>
        ✉️ EMAILS: apoc.imp@motiva.com.br, operacoes.imp@motiva.com.br
      </div>
      ` : ''}

      ${justification ? `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 5px solid #64748b; padding: 15px; margin: 20px 0; border-radius: 4px; color: #334155; font-size: 13.5px; line-height: 1.6;">
        <strong style="color: #0b3c5d;">Justificativa / Fundamentação da Decisão:</strong><br/>
        <div style="margin-top: 8px; white-space: pre-line; color: #1e293b;">${justification}</div>
      </div>
      ` : ''}

      <h3 style="color: #0b3c5d; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Resumo dos Dados</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #555;">Empresa/Entidade:</td>
          <td style="padding: 6px 0;">${requestData.company.name}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Período Solicitado:</td>
          <td style="padding: 6px 0; font-weight: bold; color: #ef5b25;">De ${formattedStart} a ${formattedEnd}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Intenção de Voo:</td>
          <td style="padding: 6px 0;">${formatIntentions(requestData.intentions)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Aeronave:</td>
          <td style="padding: 6px 0;">${requestData.aircraft.typeQty}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Piloto:</td>
          <td style="padding: 6px 0;">${requestData.pilot.name}</td>
        </tr>
      </table>

      <p style="margin-top: 20px; font-size: 13px; color: #666;">
        Você pode acompanhar todas as suas solicitações acessando o <a href="https://altercaohorario.vercel.app/dashboard" style="color: #ef5b25; text-decoration: none; font-weight: bold;">Painel do Operador</a>.
      </p>

      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #777; text-align: center; margin: 0;">SBIZ - Sistema de Solicitação de Prorrogação de Horário<br/>NAV Brasil - DNIZ</p>
    </div>
  `;

  const to = [{ email, name }];
  if (ccEmails) {
    const additionalEmails = ccEmails.split(/[,;]/).map(e => e.trim()).filter(Boolean);
    additionalEmails.forEach(additionalEmail => {
      to.push({ email: additionalEmail, name: "Cópia - NAV Brasil" });
    });
  }

  return sendEmail({
    to,
    subject,
    htmlContent,
    requestId: requestData.id,
    emailType: "operator_decision",
  });
}

/**
 * Sends a notification email to the operator when the request is auto-rejected due to delinquent aircraft.
 */
export async function sendDelinquentRejectionEmail({ email, name, requestData }) {
  const idShort = requestData.id.slice(-6).toUpperCase();
  const subject = `[REPROVADA AUTOMATICAMENTE] Solicitação de Prorrogação de Horário #${idShort} - SBIZ`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333;">
      <h2 style="color: #c92a2a; border-bottom: 2px solid #ef5b25; padding-bottom: 10px; margin-top: 0;">Solicitação Indeferida de Imediato</h2>
      <p>Olá, <strong>${name}</strong>,</p>
      <p>A sua solicitação de prorrogação de horário para o Aeroporto de Imperatriz (SBIZ) foi recebida e processada.</p>
      
      <div style="background-color: #fff5f5; border: 1px solid #ffc9c9; border-left: 5px solid #c92a2a; padding: 15px; margin: 20px 0; border-radius: 4px; color: #c92a2a;">
        <h4 style="margin: 0 0 5px 0; font-size: 16px;">Status: <strong>SOLICITAÇÃO REPROVADA</strong></h4>
        <p style="margin: 0; font-size: 14px; color: #555;">
          Identificamos que a aeronave de matrícula <strong>${requestData.aircraft?.registration || "solicitada"}</strong> possui pendências financeiras (inadimplência) junto à NAV Brasil.
        </p>
      </div>

      <p style="font-size: 14px; line-height: 1.5; font-weight: bold; color: #333;">
        Esta solicitação foi REPROVADA DE IMEDIATO e não entrará em análise operacional.
      </p>
      <p style="font-size: 14px; line-height: 1.5; color: #555;">
        Para regularizar as pendências e reabilitar a aeronave para futuras solicitações, por favor, entre em contato com a administração da <strong>NAV Brasil / DNIZ</strong>.
      </p>

      <h3 style="color: #0b3c5d; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Dados da Aeronave Restrita</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #555;">Empresa/Entidade:</td>
          <td style="padding: 6px 0;">${requestData.company.name}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Matrícula Aeronave:</td>
          <td style="padding: 6px 0; font-weight: bold; color: #ef5b25;">${requestData.aircraft.registration}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Tipo/Qtd:</td>
          <td style="padding: 6px 0;">${requestData.aircraft.typeQty}</td>
        </tr>
      </table>

      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #777; text-align: center; margin: 0;">SBIZ - Sistema de Solicitação de Prorrogação de Horário<br/>NAV Brasil - DNIZ</p>
    </div>
  `;

  return sendEmail({
    to: [{ email, name }],
    subject,
    htmlContent,
    requestId: requestData.id,
    emailType: "delinquent_rejection",
  });
}

/**
 * Sends a notification email to the specific shift operator (OEA) about the confirmed request.
 */
export async function sendOperatorNotificationEmail({ operatorEmail, operatorName, requestData, pdfBase64, subjectPrefix }) {
  const idShort = requestData.id.slice(-6).toUpperCase();
  const prefix = subjectPrefix || "SOLICITAÇÃO DE PRORROGAÇÃO DE HORÁRIO - SBIZ";
  const subject = `[AVISO AO OPERADOR DE TURNO] ${prefix} #${idShort} - ${requestData.company.name}`;
  
  const formattedStart = new Date(requestData.period.start).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const formattedEnd = new Date(requestData.period.end).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333;">
      <h2 style="color: #0b3c5d; border-bottom: 2px solid #ef5b25; padding-bottom: 10px; margin-top: 0;">Aviso de Prorrogação de Horário</h2>
      <p>Olá, <strong>${operatorName}</strong>,</p>
      <p>Você foi identificado como o operador do turno correspondente a esta solicitação de prorrogação de horário que foi <strong>confirmada pelo cliente</strong>:</p>
      ${getLateRequestHtml(requestData)}
      
      <h3 style="color: #0b3c5d; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Resumo dos Dados</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #555;">Empresa/Entidade:</td>
          <td style="padding: 6px 0;">${requestData.company.name}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Período Solicitado:</td>
          <td style="padding: 6px 0; font-weight: bold; color: #ef5b25;">De ${formattedStart} a ${formattedEnd}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Intenção de Voo:</td>
          <td style="padding: 6px 0; font-weight: bold; color: #ef5b25;">${formatIntentions(requestData.intentions)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Aeronave:</td>
          <td style="padding: 6px 0;">${requestData.aircraft.typeQty} (${requestData.aircraft.registration || '-'})</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555;">Piloto:</td>
          <td style="padding: 6px 0;">${requestData.pilot.name}</td>
        </tr>
        ${requestData.notes ? `
        <tr>
          <td style="padding: 6px 0; font-weight: bold; color: #555; vertical-align: top;">Observações:</td>
          <td style="padding: 6px 0; font-style: italic;">${requestData.notes}</td>
        </tr>` : ''}
      </table>

      <p style="margin-top: 20px;">O documento oficial PDF encontra-se <strong>anexado a este e-mail</strong>.</p>
      
      <div style="background-color: #f5f5f5; border: 1px solid #ddd; padding: 15px; margin-top: 20px; border-radius: 4px; font-size: 13px;">
        <strong>Informações do Registro:</strong><br/>
        ID da Solicitação: <code style="background-color: #eaeaea; padding: 2px 4px; border-radius: 3px;">${requestData.id}</code><br/>
        Confirmado pelo Usuário em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
      </div>

      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #777; text-align: center; margin: 0;">SBIZ - Sistema de Solicitação de Prorrogação de Horário<br/>NAV Brasil - DNIZ</p>
    </div>
  `;

  return sendEmail({
    to: [{ email: operatorEmail, name: operatorName }],
    subject,
    htmlContent,
    attachmentName: `solicitacao_SBIZ_${idShort}_${requestData.company.name.replace(/\s+/g, '_')}.pdf`,
    pdfBase64,
    requestId: requestData.id,
    emailType: "operator_notification",
  });
}
