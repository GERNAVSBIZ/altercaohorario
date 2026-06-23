import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const escalaConfig = {
  apiKey: "AIzaSyApoDIAXZ5_6GlytJp6IyesM-6epXDqo6k",
  authDomain: "dashboard-escala.firebaseapp.com",
  projectId: "dashboard-escala",
  storageBucket: "dashboard-escala.appspot.com",
  messagingSenderId: "451393122794",
  appId: "1:451393122794:web:24f125f11ef3260b770293"
};

let escalaDb = null;
function getEscalaDb() {
  if (!escalaDb) {
    try {
      const apps = getApps();
      const existingApp = apps.find(a => a.name === "escalaServerApp");
      const app = existingApp || initializeApp(escalaConfig, "escalaServerApp");
      escalaDb = getFirestore(app);
    } catch (err) {
      console.error("Error initializing escala server database:", err);
    }
  }
  return escalaDb;
}

function getBrasiliaParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  parts.forEach(p => map[p.type] = p.value);
  return {
    year: parseInt(map.year),
    month: parseInt(map.month),
    day: parseInt(map.day),
    hour: parseInt(map.hour),
    minute: parseInt(map.minute)
  };
}

export async function getOperatorsFromScale(startIsoString) {
  const db = getEscalaDb();
  if (!db) {
    console.error("Scale database not initialized.");
    return [];
  }

  try {
    const parts = getBrasiliaParts(new Date(startIsoString));
    let targetShift = "C";
    
    // Create base date in local values
    let baseDate = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    
    if (parts.hour >= 0 && parts.hour < 5) {
      targetShift = "A";
    } else if (parts.hour >= 5 && parts.hour < 10) {
      targetShift = "B";
    } else if (parts.hour >= 10 && parts.hour < 22) {
      targetShift = "C";
    } else {
      // 22h and 23h are anticipating Turno A of next day
      targetShift = "A";
      baseDate.setDate(baseDate.getDate() + 1);
    }

    const targetYear = baseDate.getFullYear();
    const targetMonth = baseDate.getMonth() + 1;
    const targetDay = baseDate.getDate();

    const monthNamesPt = [
      "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
      "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
    ];
    const docId = `${String(targetMonth).padStart(2, '0')}-${targetYear}-${monthNamesPt[targetMonth - 1]}`;

    console.log(`[Escala Server] Querying scale for date: ${startIsoString}. Local time: ${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}. Shift Target Date: ${targetDay}/${targetMonth}/${targetYear}. Target Shift: ${targetShift}. Document ID: ${docId}`);

    const docRef = doc(db, "artifacts/dashboard-escala/schedules", docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const dateHeaders = data.dateHeaders || [];
      const scheduleData = data.scheduleData || [];
      
      const dayIndex = dateHeaders.findIndex(d => parseInt(d) === targetDay);
      if (dayIndex !== -1) {
        const matchingOps = scheduleData.filter(op => op.shifts && op.shifts[dayIndex] === targetShift);
        if (matchingOps.length > 0) {
          const names = matchingOps.map(op => op.name);
          console.log(`[Escala Server] Found operators on shift: ${names.join(", ")}`);
          return names;
        }
      }
      console.warn(`[Escala Server] Shift ${targetShift} not found in date headers for day ${targetDay}`);
    } else {
      console.warn(`[Escala Server] Scale document ${docId} does not exist.`);
    }
  } catch (error) {
    console.error("Error in getOperatorsFromScale server service:", error);
  }
  return [];
}

export async function getOperatorFromScale(startIsoString) {
  const operators = await getOperatorsFromScale(startIsoString);
  return operators.length > 0 ? operators[0] : null;
}
