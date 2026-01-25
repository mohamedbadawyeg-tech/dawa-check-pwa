import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sahaty.app',
  appName: 'صحتي',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_notification",
      iconColor: "#488AFF",
      sound: "beep.wav",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '608914168606-cr9293qscukk9ngu4fkllcl2nbug8usf.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  }
};

export default config;
