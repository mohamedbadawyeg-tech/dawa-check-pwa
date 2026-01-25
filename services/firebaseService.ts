
import { AppState } from "../types";
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, push, serverTimestamp, child, get } from "firebase/database";

export const API_KEY = "AIzaSyA19OCKhLfBnN-Z_7qeat5Skj6uhk4pP88";

const firebaseConfig = {
  apiKey: API_KEY,
  authDomain: "sahaty-app-68685.firebaseapp.com",
  projectId: "sahaty-app-68685",
  storageBucket: "sahaty-app-68685.firebasestorage.app",
  messagingSenderId: "608914168606",
  appId: "1:608914168606:android:c69b905f228a0e5c67070f",
  databaseURL: "https://sahaty-app-68685-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export const requestForToken = async () => {
  return null;
};

export const onForegroundMessage = (callback: (payload: any) => void) => {
  return () => {};
};

export const saveTokenToDatabase = async (patientId: string, token: string) => {
  console.log(`[Firebase] Saved token for ${patientId}: ${token}`);
  try {
    const tokenRef = ref(db, `users/${patientId}/fcmToken`);
    await set(tokenRef, token);
  } catch (e) {
    console.error("Error saving token", e);
  }
};

export const syncPatientData = async (patientId: string, data: AppState) => {
  try {
    const userRef = ref(db, `users/${patientId}/data`);
    // Filter out potentially large or circular data if necessary, 
    // but AppState should be JSON serializable.
    // We avoid syncing 'local' state like UI toggles if they are in AppState,
    // but assuming AppState is the persisted state.
    
    // Create a clean object to sync (removing any undefined/functions)
    const cleanData = JSON.parse(JSON.stringify(data));
    cleanData.lastUpdated = serverTimestamp();
    
    await set(userRef, cleanData);
    console.log(`[Firebase] Synced data for ${patientId}`);
  } catch (e) {
    console.error("Firebase sync failed", e);
  }
};

export const sendRemoteReminder = async (patientId: string, medName: string) => {
  console.log(`[Firebase] Sending reminder to ${patientId} for ${medName}`);
  try {
    const remindersRef = ref(db, `users/${patientId}/reminders`);
    const newReminderRef = push(remindersRef);
    await set(newReminderRef, {
      medicationName: medName,
      timestamp: serverTimestamp(),
      type: 'manual_reminder',
      sender: 'caregiver'
    });
  } catch (e) {
    console.error("Failed to send remote reminder", e);
  }
};

export const listenToPatient = (patientId: string, onUpdate: (data: Partial<AppState>) => void) => {
  const userRef = ref(db, `users/${patientId}/data`);
  
  const unsubscribe = onValue(userRef, (snapshot) => {
    const val = snapshot.val();
    if (val) {
      console.log(`[Firebase] Received update for ${patientId}`);
      onUpdate(val);
    }
  }, (error) => {
    console.error("Firebase listen error", error);
  });

  return unsubscribe;
};

export const generateSyncId = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
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
              title: 'نسخة احتياطية - صحتي',
              text: 'ملف النسخة الاحتياطية لتطبيق صحتي',
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
