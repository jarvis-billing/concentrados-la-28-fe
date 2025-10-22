import { toast } from 'ngx-sonner';

export function handleError(error: any, message: string): void {
    console.log('handleError: ', error);
    // Evitar toasts duplicados: 401/403 se manejan en error.interceptor
    if (error?.status === 401 || error?.status === 403) {
        toast.error('Error.status: ' + error.status);
        return;
    }
    if (error.error && typeof error.error === 'string') {
        toast.error('Error.error: ' + error.error);
    } else if (error.message) {
        toast.error('Error.message: ' + error.message);
    } else {
        toast.error('Message: ' + message);
    }
}