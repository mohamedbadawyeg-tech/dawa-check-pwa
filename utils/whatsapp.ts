/**
 * Opens WhatsApp with a pre-filled message.
 * @param message The message to send.
 * @param phone The phone number to send the message to (optional).
 */
export const openWhatsApp = (message: string, phone?: string) => {
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};
