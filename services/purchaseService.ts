
import { Purchases, PurchasesPackage, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
import { Platform } from 'react-native'; // Not needed for web/cap, just logic

// REPLACE WITH YOUR REVENUECAT KEYS
const API_KEYS = {
  google: "goog_YOUR_REVENUECAT_GOOGLE_API_KEY", 
  // ios: "appl_YOUR_REVENUECAT_IOS_API_KEY" 
};

export const ENTITLEMENT_ID = 'ai_assistant_pro'; 

export interface SubscriptionStatus {
  isActive: boolean;
  expirationDate: string | null;
  customerInfo: any;
}

export const initializePurchases = async () => {
  try {
    if (window.Capacitor && window.Capacitor.isNative) {
        // Only run on native
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
        
        // Configure with Google API Key
        await Purchases.configure({ apiKey: API_KEYS.google });
        
        console.log("RevenueCat configured successfully");
    }
  } catch (e) {
    console.error("RevenueCat Init Error", e);
  }
};

export const checkSubscriptionStatus = async (): Promise<SubscriptionStatus> => {
  try {
    // DEV MODE: Always active in development environment
    if (import.meta.env.DEV) {
       console.log("DEV MODE: Subscription mocked as active");
       return { isActive: true, expirationDate: new Date(Date.now() + 86400000).toISOString(), customerInfo: {} };
    }

    if (!window.Capacitor || !window.Capacitor.isNative) {
        return { isActive: false, expirationDate: null, customerInfo: null };
    }

    const customerInfo = await Purchases.getCustomerInfo();
    const entitlement = customerInfo.customerInfo.entitlements.active[ENTITLEMENT_ID];
    
    return {
      isActive: !!entitlement,
      expirationDate: entitlement?.expirationDate || null,
      customerInfo: customerInfo.customerInfo
    };
  } catch (e) {
    console.error("Check Subscription Error", e);
    return { isActive: false, expirationDate: null, customerInfo: null };
  }
};

export const getOfferings = async () => {
  try {
    if (!window.Capacitor || !window.Capacitor.isNative) return null;
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (e) {
    console.error("Get Offerings Error", e);
    return null;
  }
};

export const purchasePackage = async (pkg: PurchasesPackage): Promise<boolean> => {
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const isPro = typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
    return isPro;
  } catch (e: any) {
    if (!e.userCancelled) {
      console.error("Purchase Error", e);
      alert("حدث خطأ أثناء الدفع: " + e.message);
    }
    return false;
  }
};

export const restorePurchases = async (): Promise<boolean> => {
    try {
        const { customerInfo } = await Purchases.restorePurchases();
        return typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
    } catch (e) {
        console.error("Restore Error", e);
        return false;
    }
}
