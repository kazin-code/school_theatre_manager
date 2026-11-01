/** Password rule shared by the browser (live checklist) and the server (enforcement). */
export const PASSWORD_RULE = "At least 8 characters, including a capital letter and a special character such as ! @ # $ % &.";

export function passwordChecks(pw: string) {
  return [
    { ok: [...pw].length >= 8, label: "8 or more characters" },
    { ok: /\p{Lu}/u.test(pw), label: "a capital letter" },
    { ok: /[^\p{L}\p{N}\s]/u.test(pw), label: "a special character (! @ # $ % & …)" },
  ];
}

export function passwordProblem(pw: string): string | null {
  const missing = passwordChecks(pw).filter((c) => !c.ok).map((c) => c.label.replace(/ \(.*\)$/, "").replace("8 or more", "at least 8"));
  if (!missing.length) return null;
  const list = missing.length === 1 ? missing[0] : missing.slice(0, -1).join(", ") + " and " + missing[missing.length - 1];
  return `The password needs ${list}.`;
}

export const USERNAME_RE = /^[a-zA-Z0-9._-]{3,40}$/;
