"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged 
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Plane, Lock, Mail, UserPlus, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const checkAdminAndRedirect = async (user) => {
    if (!user) return;
    const email = user.email || "";
    const lowerEmail = email.toLowerCase();
    
    let isAdmin = lowerEmail === "wilkson.carvalho@navbrasil.gov.br";

    if (!db) {
      // Sandbox mode check
      isAdmin = 
        lowerEmail === "wilkson.carvalho@navbrasil.gov.br" ||
        lowerEmail === "gernavsbiz@gmail.com" ||
        lowerEmail === "developer@sbiz.local";
      
      if (isAdmin) {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
      return;
    }

    try {
      if (!isAdmin) {
        const profileSnap = await getDoc(doc(db, "profiles", user.uid));
        if (profileSnap.exists()) {
          const profileData = profileSnap.data();
          if (profileData.role === "admin") {
            isAdmin = true;
          }
        }
      }

      if (!isAdmin) {
        const settingsRes = await fetch("/api/admin/settings");
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          const allowedAdminsStr = settingsData.settings?.adminEmails || "";
          const allowedAdmins = allowedAdminsStr
            .split(/[,;]/)
            .map(e => e.trim().toLowerCase())
            .filter(e => e.length > 0);
          if (allowedAdmins.includes(lowerEmail)) {
            isAdmin = true;
          }
        }
      }
    } catch (err) {
      console.error("Error checking admin privilege during redirect:", err);
    }

    if (isAdmin) {
      router.push("/admin");
    } else {
      router.push("/dashboard");
    }
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        checkAdminAndRedirect(user);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (!auth) {
      setError("O Firebase não foi configurado. Por favor, adicione as chaves no arquivo .env.local.");
      setLoading(false);
      return;
    }

    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
        setSuccess("Conta criada com sucesso! Redirecionando...");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setSuccess("Login efetuado com sucesso! Redirecionando...");
      }
      setTimeout(() => {
        checkAdminAndRedirect(auth.currentUser);
      }, 1000);
    } catch (err) {
      console.error("Auth error:", err);
      let message = "Ocorreu um erro ao processar sua solicitação.";
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        message = "E-mail ou senha incorretos.";
      } else if (err.code === "auth/email-already-in-use") {
        message = "Este endereço de e-mail já está em uso.";
      } else if (err.code === "auth/weak-password") {
        message = "A senha deve ter pelo menos 6 caracteres.";
      } else if (err.code === "auth/invalid-email") {
        message = "Endereço de e-mail inválido.";
      }
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <div className="brand">
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "rgba(239, 91, 37, 0.1)",
            border: "1.5px solid var(--accent)",
            color: "var(--accent)",
            marginBottom: "12px"
          }}>
            <Plane size={28} style={{ transform: "rotate(45deg)" }} />
          </div>
          <h1 className="brand-title">NAVMANAGER</h1>
          <p className="brand-subtitle">NAV Brasil - DNIZ</p>
        </div>

        <h2 style={{ fontSize: "20px", marginBottom: "20px", textAlign: "center" }}>
          {isRegister ? "Criar Nova Conta" : "Entrar no Sistema"}
        </h2>

        {error && (
          <div className="notification notification-error">
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="notification notification-success">
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">E-mail</label>
            <div style={{ position: "relative" }}>
              <Mail 
                size={18} 
                style={{ 
                  position: "absolute", 
                  left: "14px", 
                  top: "16px", 
                  color: "var(--text-dark-muted)" 
                }} 
              />
              <input
                type="email"
                required
                className="form-input"
                style={{ paddingLeft: "44px" }}
                placeholder="seu.email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Senha</label>
            <div style={{ position: "relative" }}>
              <Lock 
                size={18} 
                style={{ 
                  position: "absolute", 
                  left: "14px", 
                  top: "16px", 
                  color: "var(--text-dark-muted)" 
                }} 
              />
              <input
                type="password"
                required
                className="form-input"
                style={{ paddingLeft: "44px" }}
                placeholder="Sua senha secreta"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <button type="submit" className="btn" disabled={loading}>
            {loading ? (
              <span className="spinner"></span>
            ) : (
              <>
                {isRegister ? (
                  <>
                    <UserPlus size={18} className="btn-icon" />
                    Criar Conta
                  </>
                ) : (
                  <>
                    <LogIn size={18} className="btn-icon" />
                    Acessar Painel
                  </>
                )}
              </>
            )}
          </button>
        </form>

        <button 
          onClick={() => {
            setIsRegister(!isRegister);
            setError("");
            setSuccess("");
          }}
          className="btn btn-secondary"
          disabled={loading}
        >
          {isRegister ? "Já possui conta? Faça Login" : "Novo usuário? Cadastre-se"}
        </button>
      </div>
    </div>
  );
}
