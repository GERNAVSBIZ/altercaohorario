import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { generateRequestPdf } from "@/lib/pdf-generator";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID da solicitação é obrigatório." }, { status: 400 });
    }

    let requestData = null;

    if (adminDb) {
      const docSnap = await adminDb.collection("requests").doc(id).get();
      if (!docSnap.exists) {
        return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
      }
      requestData = { id: docSnap.id, ...docSnap.data() };
    } else {
      // Sandbox/Mock Mode Fallbacks
      if (global.lastMockRequest && global.lastMockRequest.id === id) {
        requestData = global.lastMockRequest;
      } else {
        requestData = {
          id,
          status: "confirmed",
          createdAt: new Date().toISOString(),
          company: {
            name: "Táxi Aéreo Simulado Ltda",
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

    const pdfBuffer = await generateRequestPdf(requestData);
    const shortId = id.slice(-6).toUpperCase();

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="solicitacao_SBIZ_${shortId}.pdf"`,
      },
    });

  } catch (error) {
    console.error("Error generating PDF for download:", error);
    return NextResponse.json({ error: "Erro ao gerar PDF: " + error.message }, { status: 500 });
  }
}
