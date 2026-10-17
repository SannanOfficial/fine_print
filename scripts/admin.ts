/**
 * Manage admin accounts. Admins sign in at /admin to review private
 * submissions and edit change summaries. There is no sign-up page: accounts
 * exist only if someone with database access creates them here.
 *
 *   npm run admin -- add <email> "<name>"   create an admin and print a password
 *   npm run admin -- reset <email>          print a new password, sign out everywhere
 *   npm run admin -- disable <email>        block sign-in and sign out everywhere
 *   npm run admin -- enable <email>
 *   npm run admin -- list
 *
 * Uses MONGODB_WRITE_URI.
 */
import { ObjectId } from "mongodb";
import { generatePassword, hashPassword } from "../src/core/password.ts";
import { collections, connectWriter } from "../src/crawler/db.ts";

const [command, rawEmail, ...rest] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
const name = rest.join(" ").trim();

const usage = () => {
  console.error('Usage: npm run admin -- add <email> "<name>" | reset <email> | disable <email> | enable <email> | list');
  process.exit(1);
};
if (!command || (command !== "list" && !email)) usage();
if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`"${email}" is not an email address.`);
  process.exit(1);
}

const { client, db } = await connectWriter();
const c = collections(db);

const printPassword = (password: string) => {
  console.log(`\nPassword for ${email} (shown only once, so store it in a password manager):\n\n  ${password}\n`);
};

try {
  switch (command) {
    case "add": {
      if (!name) usage();
      if (await c.admins.findOne({ email })) {
        console.error(`${email} is already an admin. Use "reset" for a new password.`);
        process.exit(1);
      }
      const password = generatePassword();
      await c.admins.insertOne({
        _id: new ObjectId(),
        email: email!,
        name,
        passwordHash: await hashPassword(password),
        createdAt: new Date(),
        disabledAt: null,
      });
      console.log(`Added ${name} <${email}>.`);
      printPassword(password);
      break;
    }
    case "reset": {
      const password = generatePassword();
      const admin = await c.admins.findOneAndUpdate({ email }, { $set: { passwordHash: await hashPassword(password) } });
      if (!admin) throw new Error(`No admin with the email ${email}.`);
      await c.sessions.deleteMany({ adminId: admin._id });
      printPassword(password);
      break;
    }
    case "disable":
    case "enable": {
      const admin = await c.admins.findOneAndUpdate(
        { email },
        { $set: { disabledAt: command === "disable" ? new Date() : null } },
      );
      if (!admin) throw new Error(`No admin with the email ${email}.`);
      if (command === "disable") await c.sessions.deleteMany({ adminId: admin._id });
      console.log(`${email} ${command}d.`);
      break;
    }
    case "list": {
      const admins = await c.admins.find({}, { sort: { email: 1 } }).toArray();
      if (admins.length === 0) console.log('No admins yet. Add one with: npm run admin -- add <email> "<name>"');
      for (const a of admins) console.log(`${a.email}  ${a.name}${a.disabledAt ? "  (disabled)" : ""}`);
      break;
    }
    default:
      usage();
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await client.close();
}
