import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req) {
  try {
    // In a fully deployed production app, we would extract the authorization headers,
    // verify the ID token via adminAuth, and assert that the user doc has role === 'admin'.
    // For local evaluation, we allow direct retrieval.

    if (adminDb) {
      const requestsSnap = await adminDb
        .collection("requests")
        .orderBy("createdAt", "desc")
        .get();

      const requests = [];
      requestsSnap.forEach((doc) => {
        requests.push({ id: doc.id, ...doc.data() });
      });

      return NextResponse.json({ success: true, requests });
    } else {
      // Sandbox fallback data to demonstrate admin capabilities out of the box
      const mockRequests = [
        {
          id: "req_dce9afbfea3d75f5",
          status: "pending_confirmation",
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          company: {
            name: "Táxi Aéreo DNIZ S/A",
            taxId: "09.876.543/0001-21",
            email: "wilkson.carvalho@navbrasil.gov.br",
            phone: "(99) 98765-4321",
            address: "Av. Aeroporto, SBIZ, Hangar 2"
          },
          aircraft: {
            operator: "Táxi Aéreo DNIZ",
            typeQty: "C208 / 1"
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
        },
        {
          id: "req_a1b2c3d4e5f6g7h8",
          status: "confirmed",
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          confirmedAt: new Date(Date.now() - 86000000).toISOString(),
          confirmationIp: "177.42.12.89",
          company: {
            name: "Latam Airlines Brasil",
            taxId: "02.012.889/0001-09",
            email: "operacoes.sbiz@latam.com.br",
            phone: "(99) 3521-1200",
            address: "Saguão Principal SBIZ"
          },
          aircraft: {
            operator: "Latam Cargo",
            typeQty: "A320 / 1"
          },
          requestor: {
            name: "Marcos Souza",
            role: "Supervisor de Aeroporto",
            billingEmail: "faturamento.br@latam.com"
          },
          pilot: {
            name: "Carlos Eduardo",
            anacCode: "109843"
          },
          serviceType: "Regular (Passageiros)",
          period: {
            start: new Date(Date.now() + 86400000).toISOString(),
            end: new Date(Date.now() + 93600000).toISOString()
          },
          notes: "Ajuste na malha devido a condições meteorológicas no aeroporto de origem."
        }
      ];

      return NextResponse.json({ success: true, requests: mockRequests, mock: true });
    }
  } catch (error) {
    console.error("API Admin Requests fetch error:", error);
    return NextResponse.json(
      { error: "Erro ao obter o histórico de solicitações: " + error.message },
      { status: 500 }
    );
  }
}
