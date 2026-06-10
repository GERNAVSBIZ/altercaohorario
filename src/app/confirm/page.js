"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, Plane, Clock, ShieldCheck } from "lucide-react";

function ConfirmPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  
  // Prevent duplicate trigger in React Strict Mode (which mounts/unmounts components twice in dev)
  const isTriggered = useRef(false);

  useEffect(() => {
    if (isTriggered.current) return;
    isTriggered.current = true;

    if (!id || !token) {
      setError("Parâmetros de validação ausentes ou corrompidos. Verifique o link enviado por e-mail.");
      setLoading(false);
      return;
    }

    async function confirmRequest() {
      try {
        const response = await fetch("/api/requests/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, token })
        });

        const resData = await response.json();

        if (!response.ok) {
          throw new Error(resData.error || "Ocorreu um erro ao processar a confirmação.");
        }

        setData(resData);
      } catch (err) {
        console.error("Confirmation fetch error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    confirmRequest();
  }, [id, token]);

  if (loading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <Loader2 className="spinner" size={40} style={{ color: "var(--accent)", marginBottom: "16px" }} />
        <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>Processando Validação</h2>
        <p style={{ color: "var(--text-dark-muted)", fontSize: "14px" }}>
          Verificando sua assinatura digital e preparando o despacho para a administração do aeroporto...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: "40px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "rgba(239, 68, 68, 0.1)",
            border: "2px solid var(--error)",
            color: "var(--error)",
            marginBottom: "16px"
          }}>
            <XCircle size={32} />
          </div>
          <h2 style={{ fontSize: "22px", color: "white" }}>Falha na Confirmação</h2>
          <p style={{ color: "var(--text-dark-muted)", fontSize: "14px", marginTop: "6px" }}>
            Não foi possível validar sua solicitação.
          </p>
        </div>

        <div className="notification notification-error" style={{ margin: "20px 0" }}>
          <span>{error}</span>
        </div>

        <p style={{ fontSize: "13px", color: "var(--text-dark-muted)", textAlign: "center", lineHeight: "1.5" }}>
          Por favor, verifique se o link copiado está correto ou tente reenviar o formulário no seu painel.
        </p>

        <button onClick={() => router.push("/login")} className="btn btn-secondary" style={{ marginTop: "24px" }}>
          Ir para o Login
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: "36px 24px" }}>
      <div className="success-check">
        <CheckCircle2 size={40} />
      </div>

      <h1 className="success-title">Solicitação Confirmada!</h1>
      <p className="success-subtitle">
        {data?.alreadyConfirmed 
          ? "Esta prorrogação já havia sido validada anteriormente."
          : "Sua assinatura digital foi verificada e a solicitação foi protocolada."}
      </p>

      <div className="info-list">
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "8px", 
          borderBottom: "1.5px solid var(--border-dark)", 
          paddingBottom: "10px", 
          marginBottom: "12px"
        }}>
          <ShieldCheck size={18} style={{ color: "var(--success)" }} />
          <strong style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-dark-muted)" }}>
            Comprovante de Envio
          </strong>
        </div>

        <div className="info-item">
          <span className="info-label">Empresa</span>
          <span className="info-value">{data?.companyName}</span>
        </div>

        <div className="info-item">
          <span className="info-label">Aeronave</span>
          <span className="info-value">{data?.aircraftTypeQty}</span>
        </div>

        <div className="info-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
          <span className="info-label">Período de Prorrogação</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", fontSize: "13px", color: "white" }}>
            <Clock size={14} style={{ color: "var(--accent)" }} />
            <span>
              De {new Date(data?.period?.start).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}<br />
              Até {new Date(data?.period?.end).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </span>
          </div>
        </div>
      </div>

      <div style={{
        backgroundColor: "rgba(16, 185, 129, 0.05)",
        border: "1px dashed rgba(16, 185, 129, 0.2)",
        borderRadius: "var(--border-radius-sm)",
        padding: "16px",
        fontSize: "13px",
        color: "#a7f3d0",
        lineHeight: "1.5",
        textAlign: "center",
        marginBottom: "24px"
      }}>
        <strong>Encaminhamento Concluído:</strong><br />
        O e-mail oficial contendo o PDF da prorrogação foi disparado com sucesso para a administração do aeroporto (SBIZ).
      </div>

      <button onClick={() => router.push("/login")} className="btn">
        Acessar NAVMANAGER
      </button>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <div className="container">
      <div className="brand" style={{ marginBottom: "20px" }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <Plane size={20} style={{ color: "var(--accent)", transform: "rotate(45deg)" }} />
          <span style={{ fontWeight: 800, fontSize: "18px", letterSpacing: "-0.02em" }}>NAVMANAGER</span>
        </div>
        <p className="brand-subtitle" style={{ fontSize: "10px", marginTop: "2px" }}>Confirmação SBIZ</p>
      </div>

      <Suspense fallback={
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <Loader2 className="spinner" size={40} style={{ color: "var(--accent)", marginBottom: "16px" }} />
          <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>Carregando Confirmação</h2>
          <p style={{ color: "var(--text-dark-muted)", fontSize: "14px" }}>
            Aguardando carregamento dos dados...
          </p>
        </div>
      }>
        <ConfirmPageContent />
      </Suspense>
    </div>
  );
}
