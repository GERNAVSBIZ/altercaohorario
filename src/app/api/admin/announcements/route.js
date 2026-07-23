import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req) {
  try {
    if (!adminDb) {
      // Sandbox mock fallback
      const mockList = global.mockAnnouncements || [];
      return NextResponse.json({ success: true, announcements: mockList, mock: true });
    }

    const snapshot = await adminDb.collection("announcements").orderBy("createdAt", "desc").get();
    const announcements = [];
    snapshot.forEach(doc => {
      announcements.push({ id: doc.id, ...doc.data() });
    });

    return NextResponse.json({ success: true, announcements });
  } catch (error) {
    console.error("GET admin announcements error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar comunicados: " + error.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const data = await req.json();
    const { id, title, content, active } = data;

    if (!title || !content) {
      return NextResponse.json(
        { error: "Título e Conteúdo são obrigatórios." },
        { status: 400 }
      );
    }

    const payload = {
      title,
      content,
      active: active === undefined ? true : !!active,
      updatedAt: new Date().toISOString()
    };

    if (adminDb) {
      if (id) {
        // Update existing announcement
        await adminDb.collection("announcements").doc(id).update(payload);
        return NextResponse.json({
          success: true,
          message: "Comunicado atualizado com sucesso!",
          announcement: { id, ...payload }
        });
      } else {
        // Create new announcement
        payload.createdAt = new Date().toISOString();
        payload.readBy = [];
        const docRef = await adminDb.collection("announcements").add(payload);
        return NextResponse.json({
          success: true,
          message: "Comunicado criado com sucesso!",
          announcement: { id: docRef.id, ...payload }
        });
      }
    } else {
      // Sandbox mock mode
      if (!global.mockAnnouncements) {
        global.mockAnnouncements = [];
      }

      if (id) {
        global.mockAnnouncements = global.mockAnnouncements.map(item => 
          item.id === id ? { ...item, ...payload } : item
        );
        return NextResponse.json({
          success: true,
          message: "[SIMULAÇÃO] Comunicado atualizado com sucesso!",
          announcement: { id, ...payload }
        });
      } else {
        const mockId = `ann_${Date.now()}`;
        payload.createdAt = new Date().toISOString();
        payload.readBy = [];
        const newAnn = { id: mockId, ...payload };
        global.mockAnnouncements.push(newAnn);
        return NextResponse.json({
          success: true,
          message: "[SIMULAÇÃO] Comunicado criado com sucesso!",
          announcement: newAnn
        });
      }
    }
  } catch (error) {
    console.error("POST admin announcements error:", error);
    return NextResponse.json(
      { error: "Erro ao gravar comunicado: " + error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID do comunicado é obrigatório para exclusão." },
        { status: 400 }
      );
    }

    if (adminDb) {
      await adminDb.collection("announcements").doc(id).delete();
    } else {
      // Sandbox mock fallback
      if (global.mockAnnouncements) {
        global.mockAnnouncements = global.mockAnnouncements.filter(item => item.id !== id);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Comunicado removido com sucesso!"
    });
  } catch (error) {
    console.error("DELETE admin announcements error:", error);
    return NextResponse.json(
      { error: "Erro ao excluir comunicado: " + error.message },
      { status: 500 }
    );
  }
}
