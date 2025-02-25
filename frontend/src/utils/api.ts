export const wakeupBackend = async () => {
  try {
    await fetch(import.meta.env.VITE_API_URL);
    console.log('Backend wakeup call successful');
  } catch (error) {
    console.warn('Backend wakeup call failed:', error);
  }
};
