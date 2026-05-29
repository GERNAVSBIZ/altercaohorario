import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req) {
  try {
    const { id, decision } = await req.json();

    if (!id || !["authorized", "not_authorized"].includes(decision)) {
      return NextResponse.json(
        { error: "Parâmetros inválidos fornecidos para a aprovação." },
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

      await requestRef.update({
        approvalStatus: decision,
        authorizedAt,
      });

      console.log(`[FIREBASE] Solicitação #${id} atualizada para approvalStatus: ${decision}`);
    } else {
      console.log(`[SANDBOX] Admin tomou decisão para #${id}: ${decision}`);
    }

    return NextResponse.json({
      success: true,
      message: `Solicitação ${decision === "authorized" ? "autorizada" : "recusada"} com sucesso!`,
    });

  } catch (error) {
    console.error("API Error in admin approve route:", error);
    return NextResponse.json(
      { error: "Erro interno ao registrar decisão do administrador: " + error.message },
      { status: 500 }
    );
  }
}
