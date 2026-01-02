
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  setDoc, 
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
  getMessaging, 
  getToken, 
  onMessage 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import { AppState } from "../types";

export const API_KEY = "AIzaSyCbjITpAZBfA-NItVOX6Hc3AJlet6EKk7E";

const firebaseConfig = {
  apiKey: API_KEY,
  authDomain: "eladwya-92754604-eb321.firebaseapp.com",
  projectId: "eladwya-92754604-eb321",
  storageBucket: "eladwya-92754604-eb321.firebasestorage.app",
  messagingSenderId: "319834803886",
  appId: "1:319834803886:web:6a71f628e1a20d01c5a73f"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Enable offline persistence
try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
    } else if (err.code == 'unimplemented') {
      console.warn('The current browser does not support all of the features required to enable persistence');
    }
  });
} catch (e) {
  console.warn("Failed to enable persistence:", e);
}

// Initialize messaging safely
let messaging: any = null;
try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn("Firebase Messaging failed to initialize. Notifications might not work.", e);
}

export const requestForToken = async () => {
  if (!messaging) return null;
  try {
    // Try to reuse the existing service worker registration (sw.js)
    let registration;
    if ('serviceWorker' in navigator) {
      registration = await navigator.serviceWorker.getRegistration();
    }

    const currentToken = await getToken(messaging, { 
      vapidKey: 'BN5rkFKkzuPxT7mGCq0hkUnEyODvdxuT6TI5ML33etf_SwaExFlyS5_sHNuIf0iEC-Z5B63QjPuTUusMQfjMykA',
      serviceWorkerRegistration: registration
    });
    if (currentToken) {
      console.log('current token for client: ', currentToken);
      return currentToken;
    } else {
      console.log('No registration token available. Request permission to generate one.');
      return null;
    }
  } catch (err) {
    console.log('An error occurred while retrieving token. ', err);
    return null;
  }
};

export const onForegroundMessage = (callback: (payload: any) => void) => {
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback(payload);
  });
};

export const saveTokenToDatabase = async (patientId: string, token: string) => {
  if (!patientId || !token) return;
  const docRef = doc(db, "patients", patientId);
  try {
    await setDoc(docRef, { fcmToken: token }, { merge: true });
  } catch (error) {
    console.error("Error saving token:", error);
  }
};

/**
 * Robustly sanitizes data from Firestore to ensure it's a plain JSON-compatible object.
 * Strictly allows only plain objects, arrays, and primitives.
 */
const sanitizeData = (data: any, seen = new WeakSet()): any => {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  
  // Handle circularity early
  if (seen.has(data)) return undefined;

  // Handle Firebase Timestamps
  if (typeof data.toDate === 'function') {
    return data.toDate().getTime();
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    seen.add(data);
    return data.map(item => sanitizeData(item, seen));
  }

  // Strict check for plain objects only
  const proto = Object.getPrototypeOf(data);
  if (proto === null || proto === Object.prototype) {
    seen.add(data);
    const sanitized: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        sanitized[key] = sanitizeData(data[key], seen);
      }
    }
    return sanitized;
  }

  // For non-plain objects (Firebase classes, references, etc), prune or convert to string
  // If it's a DocumentReference, it will have a 'path' property
  return data.path || String(data);
};

export const syncPatientData = async (patientId: string, data: AppState) => {
  if (!patientId || patientId.length < 4) return;
  
  const docRef = doc(db, "patients", patientId);
  try {
    const syncPayload = {
      patientName: data.patientName,
      patientAge: data.patientAge,
      medications: data.medications || [],
      takenMedications: data.takenMedications || {},
      currentReport: data.currentReport,
      dailyReports: data.dailyReports || {},
      medicalHistorySummary: data.medicalHistorySummary,
      dietGuidelines: data.dietGuidelines,
      upcomingProcedures: data.upcomingProcedures || "",
      lastUpdated: serverTimestamp()
    };
    
    await setDoc(docRef, syncPayload, { merge: true });
  } catch (error: any) {
    if (error.code === 'resource-exhausted') {
      console.error("Firestore Quota Exceeded.");
    } else {
      console.error("Firestore Sync Error:", error);
    }
  }
};

export const sendRemoteReminder = async (patientId: string, medName: string) => {
  if (!patientId) return;
  const docRef = doc(db, "patients", patientId);
  try {
    await setDoc(docRef, {
      remoteReminder: {
        timestamp: Date.now(),
        medName: medName
      }
    }, { merge: true });
  } catch (error) {
    console.error("Remote Reminder Error:", error);
  }
};

export const listenToPatient = (patientId: string, onUpdate: (data: Partial<AppState>) => void) => {
  if (!patientId || patientId.length < 4) return () => {};
  
  const docRef = doc(db, "patients", patientId);
  
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const rawData = docSnap.data();
      // Use the improved recursive sanitizer to strip out complex Firestore internals
      const cleanData = sanitizeData(rawData);
      onUpdate(cleanData as Partial<AppState>);
    }
  }, (error) => {
    if (error.code === 'resource-exhausted') {
      console.warn("Firestore Quota exceeded.");
    } else {
      console.warn("Firestore Listener error:", error.message);
    }
  });
};

export const generateSyncId = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};
