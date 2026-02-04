import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sahaty.app.v2',
  appName: 'صحتي ارابيا',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
      iconColor: "#488AFF",
      sound: "beep.wav",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '987933662797-q2kt60suqdjauuv6c38icp8st88336qh.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  }
};

export default config;
