const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
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
      const customHour = data.timeSlotSettings?.[med.timeSlot]?.hour;
      const slotHour = customHour !== undefined ? customHour : SLOT_HOURS[med.timeSlot];
      return slotHour === currentHour;
    });

    if (dueMeds.length > 0) {
      const medNames = dueMeds.map(m => m.name).join(' و ');
      
      let friendlyPrefix = '';
      const name = data.patientName || '';
      const age = parseInt(data.patientAge);
      const gender = data.patientGender;

      if (age > 0) {
    if (age < 40) friendlyPrefix = gender === 'female' ? `يا آنسة ${name}` : `يا بطل ${name}`;
    else if (age < 60) friendlyPrefix = gender === 'female' ? `يا أستاذة ${name}` : `يا أستاذ ${name}`;
        else friendlyPrefix = gender === 'female' ? `يا حاجة ${name}` : `يا حاج ${name}`;
      } else {
        friendlyPrefix = `يا ${name}`;
      }

      const message = {
        notification: {
          title: 'تذكير بموعد الدواء 💊',
          body: `${friendlyPrefix}، حان موعد تناول: ${medNames}`,
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
  return { sentCount, patientCount: snapshot.size, cairoTime };
}

/**
 * HTTP Triggered Function: Checks for medications due at the current Cairo time.
 * Can be triggered via a free Cron service (e.g., cron-job.org) or manually.
 */
exports.checkMedicationsHttp = functions.https.onRequest(async (req, res) => {
  try {
    const result = await checkAndSendMedications();
    res.status(200).send({ 
      success: true, 
      message: `Checked ${result.patientCount} patients. Sent ${result.sentCount} notifications.`,
      serverTime: result.cairoTime.toString() 
    });
    
  } catch (error) {
    console.error("Error in checkMedicationsHttp:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});

/**
 * Scheduled Function: Runs automatically every hour to check for medications.
 * Requires Firebase Blaze plan (Pay as you go).
 * 
 * UNCOMMENT THE FOLLOWING LINES IF YOU UPGRADE TO BLAZE PLAN
 */
// exports.checkMedicationsCron = functions.pubsub.schedule('0 * * * *')
//   .timeZone('Africa/Cairo')
//   .onRun(async (context) => {
//     try {
//       await checkAndSendMedications();
//       console.log("Scheduled medication check completed successfully.");
//     } catch (error) {
//       console.error("Error in checkMedicationsCron:", error);
//     }
//     return null;
//   });
