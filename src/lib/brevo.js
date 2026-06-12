const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "no-reply@sbiz.gov.br";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "SBIZ - Operações Aeroportuárias";

/**
 * Sends a transactional email via Brevo.
 * If API key is missing or is placeholder, logs contents to console.
 */
async function sendEmail({ to, subject, htmlContent, attachmentName, pdfBase64 }) {
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
 * Sends a confirmation email to the user with the confirmation link and the generated PDF.
 */
export async function sendUserConfirmationEmail({ email, name, confirmationUrl, pdfBase64, requestId }) {
  const subject = `SBIZ - Confirme sua solicitação de prorrogação #${requestId.slice(-6).toUpperCase()}`;
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333;">
      <h2 style="color: #0b3c5d; border-bottom: 2px solid #ef5b25; padding-bottom: 10px; margin-top: 0;">Confirmação de Solicitação</h2>
      <p>Olá, <strong>${name}</strong>,</p>
      <p>Recebemos o preenchimento dos dados para a prorrogação de horário da NAV Brasil - DNIZ.</p>
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
  });
}

/**
 * Sends a notification email to the operator when the admin decides (approves or rejects) a request.
 */
export async function sendOperatorDecisionEmail({ email, name, requestData, decision, ccEmails }) {
  const idShort = requestData.id.slice(-6).toUpperCase();
  const isApproved = decision === "authorized";
  const statusLabel = isApproved ? "AUTORIZADA" : "RECUSADA";
  const subject = `[${statusLabel}] Solicitação de Prorrogação de Horário #${idShort} - SBIZ`;

  const formattedStart = new Date(requestData.period.start).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const formattedEnd = new Date(requestData.period.end).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const statusColor = isApproved ? "#2b8a3e" : "#c92a2a";
  const statusBg = isApproved ? "#ebfbee" : "#fff5f5";
  const statusBorder = isApproved ? "#b2f2bb" : "#ffc9c9";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; color: #333;">
      <h2 style="color: #0b3c5d; border-bottom: 2px solid #ef5b25; padding-bottom: 10px; margin-top: 0;">Status de Solicitação Atualizado</h2>
      <p>Olá, <strong>${name}</strong>,</p>
      <p>A gerência da <strong>DNIZ - NAV Brasil</strong> avaliou a sua solicitação de prorrogação de horário para o Aeroporto de Imperatriz (SBIZ).</p>
      
      <div style="background-color: ${statusBg}; border: 1px solid ${statusBorder}; border-left: 5px solid ${statusColor}; padding: 15px; margin: 20px 0; border-radius: 4px; color: ${statusColor};">
        <h4 style="margin: 0 0 5px 0; font-size: 16px;">Sua solicitação foi: <strong>${statusLabel}</strong></h4>
        <p style="margin: 0; font-size: 14px; color: #555;">
          ${isApproved 
            ? "O seu voo foi autorizado para operar durante a prorrogação solicitada." 
            : "Infelizmente a solicitação de prorrogação de horário não pôde ser autorizada pela gerência neste momento."}
        </p>
      </div>

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
    attachmentName: `solicitacao_SBIZ_${idShort}_${requestData.company.name.replace(/\\s+/g, '_')}.pdf`,
    pdfBase64,
  });
}
