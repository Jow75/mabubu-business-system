# Putting Mabubu on the internet (free)

This takes about 20 minutes, once. Everything here is on Cloudflare's **free** plan, and no card is needed. Nothing in these steps costs money.

You will run commands in the VS Code terminal, inside the `mabubu-business-system` folder.

## 1. Create a Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up> and sign up with your email.
2. Confirm the email. You do **not** need to add a website or a payment card.

## 2. Connect this computer to the account

```bash
npx wrangler login
```

A browser page opens. Click **Allow**.

## 3. Create the database

```bash
npx wrangler d1 create mabubu
```

It prints a block that contains `"database_id": "…"`. Copy that id, open `wrangler.jsonc`, and replace `00000000-0000-0000-0000-000000000000` with it. Save.

Then create the tables:

```bash
npm run db:migrate:remote
```

## 4. Set the two secrets

Make two long random values:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Save the server secrets. Paste the first value when asked for `PIN_PEPPER` and the second for `SETUP_TOKEN`:

```bash
npx wrangler secret put PIN_PEPPER
npx wrangler secret put SETUP_TOKEN
```

**Important:**
- Write the `SETUP_TOKEN` on paper and keep it somewhere safe. It is the key that creates the owner account, and the only way back in if the owner's phone is lost.
- **Never change `PIN_PEPPER` after people have codes.** Changing it makes every access code stop working.
- Never put either value in a chat, an email or the code.

## 5. Publish

```bash
npm run deploy
```

It prints your address, for example `https://mabubu.<your-name>.workers.dev`.

## 6. First sign-in (owner)

1. Open the address on your laptop.
2. Choose **First setup or owner recovery**. Enter the setup key, your name and a **6-digit** owner code.
3. Tick the places and size groups to create, then add your vendors and garment types under **Garments & prices**. Set the Comoros selling prices.
4. **People & devices → Add person** for each family member and worker. Choose their role and give them their code **in person**.

## 7. Each person's phone

1. Open the address in **Chrome** on the phone.
2. Chrome menu (⋮) → **Add to Home screen / Install app**. It then opens like a normal app and keeps its records safe.
3. The person types their name and code. The phone shows a short code such as `K7Q-2M4`.
4. On your laptop, open **People & devices**. The request appears at the top with the same code. Check that it matches, then tap **Approve**.
5. From then on that person just taps their name and enters their code, even without internet.

## Updating later

After changes to the code:

```bash
npm run check     # tests + build must pass
npm run deploy
```

If a change adds a file in `migrations/`, first run `npm run db:migrate:remote`.

## Backups

- Cloudflare keeps 7 days of restore points automatically.
- **Settings → Download full backup** saves every record to a file. Do this weekly and keep a copy off the laptop (USB stick or Google Drive).
- A full database copy from the terminal: `npx wrangler d1 export mabubu --remote --output mabubu-backup.sql`

## If usage grows

The free plan allows 100,000 requests per day and a 500 MB database. That covers years of normal use for a family business. If the limits are ever reached, Cloudflare's **Workers Paid** plan is **$5/month**. Nothing changes in the app; you only switch the plan in the Cloudflare dashboard. Do not switch unless you decide to.
