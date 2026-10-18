/** Limits and form state shared by the submission form and its server action. */
export const LIMITS = {
  short: 120,
  medium: 200,
  text: 200_000,
  files: 3,
  totalBytes: 8 * 1024 * 1024,
} as const;

export interface SubmitValues {
  platform: string;
  platformOther: string;
  documentName: string;
  receivedOn: string;
  shownVia: string;
  text: string;
  name: string;
  email: string;
  phone: string;
  profession: string;
  prefers: "email" | "phone";
  noPatientInfo: boolean;
  contactOk: boolean;
}

export type SubmitState =
  | { status: "idle" }
  | { status: "error"; message: string; errors: Record<string, string>; values: SubmitValues; key: string }
  | { status: "sent"; reference: string; email: string; phone: string; prefers: "email" | "phone"; emailed: boolean };
