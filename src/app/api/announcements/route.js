import { NextResponse } from "next/server";
import { admin, adminDb } from "@/lib/firebase-admin";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId é obrigatório para consultar avisos pendentes." },
        { status: 400 }
      );
    }

    if (!adminDb) {
      // Sandbox fallback mode
      const mockList = (global.mockAnnouncements || []).filter(
        item => item.active && !item.readBy.includes(userId)
      );
      return NextResponse.json({ success: true, announcements: mockList, mock: true });
    }

    // Query active announcements. Since we cannot do "not-in" natively inside array checks easily
    // without secondary filters, we fetch active announcements and filter in memory.
    // This is safe since the number of active announcements is very small (usually 1 or 2).
    const snapshot = await adminDb.collection("announcements")
      .where("active", "==", true)
      .orderBy("createdAt", "desc")
      .get();

    const announcements = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const readBy = data.readBy || [];
      if (!readBy.includes(userId)) {
        announcements.push({ id: doc.id, ...data });
      }
    });

    return NextResponse.json({ success: true, announcements });
  } catch (error) {
    console.error("GET announcements error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar avisos: " + error.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const { announcementId, userId } = await req.json();

    if (!announcementId || !userId) {
      return NextResponse.json(
        { error: "announcementId e userId são obrigatórios." },
        { status: 400 }
      );
    }

    if (adminDb) {
      const docRef = adminDb.collection("announcements").doc(announcementId);
      await docRef.update({
        readBy: admin.firestore.FieldValue.arrayUnion(userId)
      });
      return NextResponse.json({
        success: true,
        message: "Aviso marcado como lido."
      });
    } else {
      // Sandbox fallback mode
      if (global.mockAnnouncements) {
        global.mockAnnouncements = global.mockAnnouncements.map(item => {
          if (item.id === announcementId) {
            const readSet = new Set(item.readBy || []);
            readSet.add(userId);
            return { ...item, readBy: Array.from(readSet) };
          }
          return item;
        });
      }
      return NextResponse.json({
        success: true,
        message: "[SIMULAÇÃO] Aviso marcado como lido."
      });
    }
  } catch (error) {
    console.error("POST announcements read error:", error);
    return NextResponse.json(
      { error: "Erro ao marcar aviso como lido: " + error.message },
      { status: 500 }
    );
  }
}
