
const admin = require("firebase-admin");

// Initialize Firebase Admin with credentials from environment variable
// In GitHub Actions, we'll store the service account JSON in a secret called FIREBASE_SERVICE_ACCOUNT
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

if (Object.keys(serviceAccount).length > 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  // Fallback for local testing if env var not set (assuming default credentials work or this will fail)
  admin.initializeApp();
}

const db = admin.firestore();

// Slot mapping (Must match constants.tsx logic)
const SLOT_HOURS = {
  'morning-fasting': 7,
  'after-breakfast': 9,
  'before-lunch': 14,
  'after-lunch': 15,
  'afternoon': 17,
  '6pm': 18,
  'after-dinner': 20,
  'before-bed': 22,
};

/**
 * Core logic to check and send medication reminders
 */
async function checkAndSendMedications() {
  const now = new Date();
  // Create date object for Cairo time
  const cairoTime = new Date(now.toLocaleString("en-US", {timeZone: "Africa/Cairo"}));
  const currentHour = cairoTime.getHours();
  
  console.log(`Running medication check for Cairo Hour: ${currentHour}`);

  // Get all patients with an FCM token
  const snapshot = await db.collection('patients').get();
  
  const promises = [];
  let sentCount = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    const token = data.fcmToken;
    
    // Skip if no token or no medications
    if (!token || !data.medications) return;

    // Find medications scheduled for this hour
    const dueMeds = data.medications.filter(med => {
      const slotHour = SLOT_HOURS[med.timeSlot];
      return slotHour === currentHour;
    });

    if (dueMeds.length > 0) {
      const medNames = dueMeds.map(m => m.name).join(' و ');
      
      const message = {
        notification: {
          title: 'تذكير بموعد الدواء 💊',
          body: `يا حاج ${data.patientName || ''}، حان موعد تناول: ${medNames}`,
        },
        data: {
          type: 'medication_reminder',
          medicationIds: dueMeds.map(m => m.id).join(','),
          click_action: '/' 
        },
        token: token
      };

      const promise = admin.messaging().send(message)
        .then(() => {
           console.log(`✅ Notification sent to ${doc.id} for ${medNames}`);
           sentCount++;
        })
        .catch(err => {
           console.error(`❌ Failed to send to ${doc.id}:`, err);
        });
        
      promises.push(promise);
    }
  });

  await Promise.all(promises);
  console.log(`Checked ${snapshot.size} patients. Sent ${sentCount} notifications.`);
  return { sentCount, patientCount: snapshot.size, cairoTime };
}

// Run the function and exit
checkAndSendMedications()
  .then(() => {
    console.log("Script finished successfully.");
    process.exit(0);
  })
  .catch(error => {
    console.error("Script failed:", error);
    process.exit(1);
  });
