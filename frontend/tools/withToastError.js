import { useToast } from '../hooks/useToast';

export function withToastError(asyncFn, toastMessageOnError) {
  return async function (...args) {
    try {
      return await asyncFn(...args);
    } catch (err) {
      const msg = err.message || String(err);
      const { showToast } = useToast(); // adjust hook usage per your framework
      showToast({
        type: 'error',
        title: 'Filesystem error',
        description: `${toastMessageOnError}: ${msg}`,
      });
      // Re-throw if caller still wants to handle it
      throw err;
    }
  };
}
