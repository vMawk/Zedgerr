import Database from "better-sqlite3";
import { join, resolve } from "path";
import { hashPassword } from "../api/auth-crypto.js";

const args = process.argv.slice(2);
const disable2fa = args.includes("--disable-2fa");
const [email, password] = args.filter((a) => !a.startsWith("--"));

if (!email || !password) {
  console.error("Usage: reset-password <email> <new-password> [--disable-2fa]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("The new password must be at least 8 characters.");
  process.exit(1);
}

const dataDir = resolve(process.env.DATA_DIR ?? join(process.cwd(), "data"));
const db = new Database(resolve(process.env.DB_PATH ?? join(dataDir, "app.db")));

const user = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email.trim()) as { id: string } | undefined;
if (!user) {
  console.error(`No account found for ${email}.`);
  process.exit(1);
}

db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(password), user.id);
if (disable2fa) {
  db.prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL, totp_recovery_codes = NULL WHERE id = ?").run(user.id);
}
db.close();
console.log(`Password updated for ${email}${disable2fa ? "; two-factor authentication turned off" : ""}.`);
