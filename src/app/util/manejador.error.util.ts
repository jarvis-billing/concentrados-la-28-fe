import { toast } from 'ngx-sonner';

export function handleError(error: any, message: string): void {
    console.log('handleError: ', error);
    if (error.error && typeof error.error === 'string') {
        toast.error(error.error);
    } else if (error.message) {
        toast.error(error.message);
    } else {
        toast.error(message);
    }
}