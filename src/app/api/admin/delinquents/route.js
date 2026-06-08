import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req) {
  try {
    if (adminDb) {
      const snap = await adminDb.collection("delinquents").orderBy("createdAt", "desc").get();
      const delinquents = [];
      snap.forEach((doc) => {
        delinquents.push({ id: doc.id, ...doc.data() });
      });
      return NextResponse.json({ success: true, delinquents });
    } else {
      // Sandbox fallback
      if (!global.mockDelinquents) {
        global.mockDelinquents = [
          {
            id: "del_1",
            registration: "PT-XYZ",
            companyName: "Táxi Aéreo Exemplo Ltda",
            taxId: "12.345.678/0001-90",
            observations: "Inadimplência de tarifas aeroportuárias",
            createdAt: new Date(Date.now() - 86400000).toISOString()
          }
        ];
      }
      return NextResponse.json({ success: true, delinquents: global.mockDelinquents, mock: true });
    }
  } catch (error) {
    console.error("GET delinquents error:", error);
    return NextResponse.json({ error: "Erro ao obter inadimplentes: " + error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { action, id, registration, companyName, taxId, observations } = await req.json();

    if (action === "add") {
      if (!registration || !companyName || !taxId) {
        return NextResponse.json({ error: "Parâmetros incompletos para adição." }, { status: 400 });
      }

      const delinquentData = {
        registration: registration.trim().toUpperCase(),
        companyName: companyName.trim(),
        taxId: taxId.trim(),
        observations: observations ? observations.trim() : "",
        createdAt: new Date().toISOString()
      };

      if (adminDb) {
        const docRef = adminDb.collection("delinquents").doc();
        await docRef.set(delinquentData);
        return NextResponse.json({ success: true, id: docRef.id });
      } else {
        // Sandbox mock
        const newId = `del_${Date.now()}`;
        if (!global.mockDelinquents) {
          global.mockDelinquents = [];
        }
        global.mockDelinquents.unshift({ id: newId, ...delinquentData });
        return NextResponse.json({ success: true, id: newId, mock: true });
      }
    } else if (action === "delete") {
      if (!id) {
        return NextResponse.json({ error: "ID é obrigatório para exclusão." }, { status: 400 });
      }

      if (adminDb) {
        await adminDb.collection("delinquents").doc(id).delete();
        return NextResponse.json({ success: true });
      } else {
        // Sandbox mock
        if (global.mockDelinquents) {
          global.mockDelinquents = global.mockDelinquents.filter((d) => d.id !== id);
        }
        return NextResponse.json({ success: true, mock: true });
      }
    } else {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
  } catch (error) {
    console.error("POST delinquent error:", error);
    return NextResponse.json({ error: "Erro ao gerenciar inadimplente: " + error.message }, { status: 500 });
  }
}
