
import { AppState } from "../types";
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, doc, setDoc, onSnapshot, getDoc, serverTimestamp } from "firebase/firestore";

// Use environment variable for API Key
export const API_KEY = import.meta.env.VITE_FIREBASE_API_KEY;

export const firebaseConfig = {
  apiKey: API_KEY,
  authDomain: "sehati-arabia.firebaseapp.com",
  projectId: "sehati-arabia",
  storageBucket: "sehati-arabia.firebasestorage.app",
  messagingSenderId: "987933662797",
  appId: "1:987933662797:web:36f5063fa51b1ac3928604",
  measurementId: "G-0TJCKRQ913"
};

export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);

export const testConnection = async () => {
  try {
    const testRef = doc(db, 'connection_test', 'test_doc');
    
    // Create a timeout promise that rejects after 5 seconds
    const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Connection timeout")), 5000)
    );

    // Race between the write operation and the timeout
    await Promise.race([
        setDoc(testRef, {
            timestamp: serverTimestamp(),
            status: 'online',
            message: 'Connection successful from Dawa Check App'
        }),
        timeout
    ]);

    return { success: true, message: "تم الاتصال بنجاح! ✅" };
  } catch (e: any) {
    console.error("Test connection failed", e);
    if (e.code === 'permission-denied') {
        return { success: false, message: "فشل الاتصال: قواعد الأمان تمنع الكتابة (تأكد من تحديث Rules في الموقع) 🔒" };
    }
    if (e.message === 'Connection timeout') {
        return { success: false, message: "فشل الاتصال: انتهت المهلة (تأكد من الإنترنت أو إعدادات المشروع) ⏳" };
    }
    return { success: false, message: `فشل الاتصال: ${e.message} ❌` };
  }
};

export const requestForToken = async () => {
  return null;
};

export const onForegroundMessage = (callback: (payload: any) => void) => {
  return () => {};
};

export const saveTokenToDatabase = async (patientId: string, token: string) => {
  console.log(`[Firebase] Saved token for ${patientId}: ${token}`);
  try {
    const userRef = doc(db, 'users', patientId);
    await setDoc(userRef, { fcmToken: token }, { merge: true });
  } catch (e) {
    console.error("Error saving token", e);
  }
};

export const syncPatientData = async (patientId: string, data: AppState) => {
  try {
    const userRef = doc(db, 'users', patientId);
    
    // Create a clean object to sync
    const cleanData = JSON.parse(JSON.stringify(data));
    
    // In Firestore, we put data in a 'data' field to avoid collisions with other fields
    // We use merge: true to avoid overwriting other fields like fcmToken
    await setDoc(userRef, {
        data: cleanData,
        lastUpdated: serverTimestamp()
    }, { merge: true });
    
    console.log(`[Firebase] Synced data for ${patientId}`);
  } catch (e) {
    console.error("Firebase sync failed", e);
  }
};

export const sendRemoteReminder = async (patientId: string, medName: string) => {
  console.log(`[Firebase] Sending reminder to ${patientId} for ${medName}`);
  try {
    const userRef = doc(db, 'users', patientId);
    // Merge into data.remoteReminder
    await setDoc(userRef, {
      data: {
        remoteReminder: {
          medicationName: medName,
          timestamp: Date.now(),
          type: 'manual_reminder',
          sender: 'caregiver'
        }
      }
    }, { merge: true });
  } catch (e) {
    console.error("Failed to send remote reminder", e);
  }
};

export const listenToPatient = (patientId: string, onUpdate: (data: Partial<AppState>) => void) => {
  const userRef = doc(db, 'users', patientId);
  
  const unsubscribe = onSnapshot(userRef, (doc) => {
    if (doc.exists()) {
      const val = doc.data();
      if (val && val.data) {
        console.log(`[Firebase] Received update for ${patientId}`);
        onUpdate(val.data);
      }
    }
  }, (error) => {
    console.error("Firebase listen error", error);
  });

  return unsubscribe;
};

export const generateSyncId = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export const getOrGenerateShortCode = async (uid: string): Promise<string> => {
  try {
    // 1. Check if user already has a short code
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists() && userSnap.data().syncCode) {
      return userSnap.data().syncCode;
    }

    // 2. Generate new unique code
    let code = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 5) {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const codeRef = doc(db, 'shortCodes', code);
      const codeSnap = await getDoc(codeRef);
      if (!codeSnap.exists()) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) throw new Error("Failed to generate unique code");

    // 3. Save mapping
    await setDoc(doc(db, 'shortCodes', code), { uid });
    await setDoc(doc(db, 'users', uid), { syncCode: code }, { merge: true });

    return code;
  } catch (e) {
    console.error("Error generating short code", e);
    return uid; // Fallback to UID
  }
};

export const retryShortCodeGeneration = async (uid: string): Promise<string> => {
    try {
        // 1. Check if user already has a short code
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists() && userSnap.data().syncCode) {
          return userSnap.data().syncCode;
        }
    
        // 2. Generate new unique code
        let code = '';
        let isUnique = false;
        let attempts = 0;
    
        while (!isUnique && attempts < 5) {
          code = Math.random().toString(36).substring(2, 8).toUpperCase();
          const codeRef = doc(db, 'shortCodes', code);
          const codeSnap = await getDoc(codeRef);
          if (!codeSnap.exists()) {
            isUnique = true;
          }
          attempts++;
        }
    
        if (!isUnique) throw new Error("Could not generate a unique code after 5 attempts");
    
        // 3. Save mapping
        await setDoc(doc(db, 'shortCodes', code), { uid });
        await setDoc(doc(db, 'users', uid), { syncCode: code }, { merge: true });
    
        return code;
      } catch (e: any) {
        console.error("Error generating short code", e);
        throw e;
      }
};

export const resolvePatientId = async (inputCode: string): Promise<string> => {
  // If input looks like a short code (6 chars, alphanumeric), try to lookup
  if (inputCode.length === 6 && /^[A-Z0-9]+$/.test(inputCode)) {
      try {
          const codeRef = doc(db, 'shortCodes', inputCode);
          const snapshot = await getDoc(codeRef);
          if (snapshot.exists()) {
              return snapshot.data().uid;
          }
      } catch (e: any) {
          console.error("Error resolving short code", e);
          if (e.code === 'permission-denied') {
             throw new Error("PERMISSION_DENIED");
          }
      }
  }
  // Default: assume it is a full UID
  return inputCode;
};

export const backupAdherenceHistory = async (patientId: string, data: any) => {
  console.log(`[Backup] Backing up data for ${patientId}`);
  
  try {
      if ((window as any).Capacitor && (window as any).Capacitor.isNative) {
          const fileName = `backup_${patientId}_${new Date().toISOString().split('T')[0]}.json`;
          
          // Write to Cache directory (temp storage for sharing)
          const result = await Filesystem.writeFile({
              path: fileName,
              data: JSON.stringify(data, null, 2),
              directory: Directory.Cache,
              encoding: Encoding.UTF8
          });
          
          // Share the file
          await Share.share({
              title: 'نسخة احتياطية - صحتي ارابيا',
            text: 'ملف النسخة الاحتياطية لتطبيق صحتي ارابيا',
              url: result.uri,
              dialogTitle: 'حفظ النسخة الاحتياطية'
          });
      } else {
          // Web fallback: Download file
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `backup_${patientId}_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      }
      
      // Also save to localStorage as fallback/cache
      localStorage.setItem(`backup_${patientId}`, JSON.stringify(data));
      
  } catch (e) {
      console.error("Backup failed", e);
      throw e;
  }
};
