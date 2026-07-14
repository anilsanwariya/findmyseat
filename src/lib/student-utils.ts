// Synthetic email format used for mobile-based Supabase auth.
export const STUDENT_EMAIL_DOMAIN = "students.lexicon.local";

export const studentEmailFromMobile = (mobile: string) =>
  `${mobile.replace(/\D/g, "")}@${STUDENT_EMAIL_DOMAIN}`;
