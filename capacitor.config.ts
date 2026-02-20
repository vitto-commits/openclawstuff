import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vitto.otto.dashboard',
  appName: 'Otto',
  webDir: 'out',
  server: {
    url: 'https://openclawstuff.vercel.app',
    cleartext: false
  },
  android: {
    backgroundColor: '#ffffff'
  }
};

export default config;
