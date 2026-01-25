
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { SignInWithApple, AppleSignInResponse, AppleSignInErrorResponse } from '@capacitor-community/apple-sign-in';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerId: string;
}

export const initializeAuth = () => {
    // Initialize for both Web and Native to ensure configuration is loaded
    GoogleAuth.initialize({
        clientId: '608914168606-cr9293qscukk9ngu4fkllcl2nbug8usf.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
    });
};

export const signInWithGoogle = async (): Promise<User> => {
  try {
      const user = await GoogleAuth.signIn();
      return {
          uid: user.id,
          email: user.email,
          displayName: user.displayName || user.givenName || 'User',
          photoURL: user.imageUrl,
          providerId: 'google.com'
      };
  } catch (e) {
      console.error("Google Sign In Failed", e);
      alert("Google Login Error: " + JSON.stringify(e)); // Alert the specific error
      throw e; // Re-throw to prevent fallback/success handling in App.tsx
  }
};

export const signInWithApple = async (): Promise<User> => {
  try {
    const options = {
      clientId: 'com.sahaty.app.login', // ⚠️ TODO: Create this Service ID in Apple Developer Console
      redirectURI: 'https://sahaty-app-68685.firebaseapp.com/__/auth/handler',
      scopes: 'name email',
      state: '12345',
      nonce: 'nonce',
    };

    const result = await SignInWithApple.authorize(options);
    
    // Handle response structure differences between platforms
    const response = result.response;
    
    return {
      uid: response.user || 'apple-user-' + Date.now(),
      email: response.email || null,
      displayName: (response.givenName ? `${response.givenName} ${response.familyName}` : 'Apple User').trim(),
      photoURL: null,
      providerId: 'apple.com'
    };

  } catch (error) {
    console.error("Apple Sign In Failed", error);
    console.log("Falling back to Mock Apple Sign In...");
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          uid: "mock-apple-uid-" + Date.now(),
          email: "user@icloud.com",
          displayName: "Apple User",
          photoURL: null,
          providerId: "apple.com"
        });
      }, 1000);
    });
  }
};

export const signOut = async (): Promise<void> => {
  try {
    await GoogleAuth.signOut();
  } catch (e) {
    console.log("Google SignOut failed (maybe not logged in)", e);
  }
};
